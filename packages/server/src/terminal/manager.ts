import { spawn, type ChildProcess } from "node:child_process";
import type { AppConfig } from "../config.js";
import type { Repo } from "../db/repo.js";
import type { Logger } from "../logger.js";

/**
 * Optional built-in web terminal — a managed `ttyd` subprocess that serves an
 * in-browser shell into the container (handy for `rclone config`/`authorize`,
 * S3/SFTP/WebDAV setup, and debugging without installing rclone elsewhere).
 *
 * It binds to 127.0.0.1 (not exposed) and DriveHub reverse-proxies it at
 * `/terminal`, so it opens inline in the app with no separate port or password
 * prompt. OFF by default (ENABLE_TERMINAL): it is a full shell on an app that
 * ships unauthenticated, so treat it as LAN/single-user only.
 */
// Raw ttyd is proxied here; the app's own /terminal page embeds it.
export const TERMINAL_BASE_PATH = "/terminal-pty";

export class TerminalManager {
  private child: ChildProcess | null = null;
  /** Runtime on/off (toggled in Settings → Developer), persisted in the DB. */
  private active: boolean;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly repo: Repo,
  ) {
    const persisted = repo.kvGet("terminal:active");
    this.active = persisted != null ? persisted === "true" : config.ENABLE_TERMINAL;
  }

  /** Whether the feature is permitted at all (admin gate via env). */
  get available(): boolean {
    return this.config.ENABLE_TERMINAL;
  }

  /** Whether the terminal is on (gate + runtime toggle). */
  get enabled(): boolean {
    return this.available && this.active;
  }

  get port(): number {
    return this.config.TERMINAL_PORT;
  }

  /** Boot: start ttyd if the feature is enabled. */
  start(): void {
    if (this.enabled) this.spawn();
  }

  /** Toggle from the UI. Throws if the feature isn't permitted by config. */
  setActive(on: boolean): void {
    if (!this.available) {
      throw new Error("The terminal is disabled by configuration. Set ENABLE_TERMINAL=true to use it.");
    }
    this.active = on;
    this.repo.kvSet("terminal:active", String(on));
    if (on) {
      if (!this.child) this.spawn();
    } else {
      this.stop();
    }
  }

  private spawn(): void {
    const bin = this.config.TERMINAL_BIN ?? "ttyd";
    // xterm theme matching the DriveHub dark UI (zinc surface, indigo accent).
    const theme = JSON.stringify({
      background: "#111114",
      foreground: "#e7e7ea",
      cursor: "#818cf8",
      cursorAccent: "#111114",
      selectionBackground: "#3b3f76",
      selectionForeground: "#ffffff",
      black: "#15151a", red: "#f87171", green: "#4ade80", yellow: "#fbbf24",
      blue: "#818cf8", magenta: "#c084fc", cyan: "#22d3ee", white: "#d4d4d8",
      brightBlack: "#52525b", brightRed: "#fca5a5", brightGreen: "#86efac",
      brightYellow: "#fcd34d", brightBlue: "#a5b4fc", brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9", brightWhite: "#fafafa",
    });
    const args = [
      "-p", String(this.config.TERMINAL_PORT),
      "-i", "127.0.0.1", // never exposed directly — only via the DriveHub proxy
      "-b", TERMINAL_BASE_PATH,
      "-t", "titleFixed=DriveHub terminal",
      "-t", "fontSize=13",
      "-t", "fontFamily=ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace",
      "-t", "lineHeight=1.25",
      "-t", "cursorBlink=true",
      "-t", "scrollbar=false",
      "-t", `theme=${theme}`,
      "-W", // allow input
      "bash",
    ];
    try {
      this.child = spawn(bin, args, { windowsHide: true });
      this.child.stdout?.resume();
      this.child.stderr?.resume();
      this.child.on("exit", (code) => {
        this.logger.warn({ code }, "web terminal (ttyd) exited");
        this.child = null;
      });
      this.logger.info({ port: this.config.TERMINAL_PORT }, "web terminal (ttyd) started");
    } catch (e) {
      this.logger.error({ err: String(e) }, "failed to start web terminal (ttyd not found?)");
    }
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }

  status(): { available: boolean; enabled: boolean; running: boolean; path: string } {
    return {
      available: this.available,
      enabled: this.enabled,
      running: this.child !== null && this.child.exitCode === null,
      path: TERMINAL_BASE_PATH,
    };
  }
}
