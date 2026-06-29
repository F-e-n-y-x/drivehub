import { spawn, type ChildProcess } from "node:child_process";
import type { AppConfig } from "../config.js";
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

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  get enabled(): boolean {
    return this.config.ENABLE_TERMINAL;
  }

  get port(): number {
    return this.config.TERMINAL_PORT;
  }

  start(): void {
    if (!this.config.ENABLE_TERMINAL) return;
    const bin = this.config.TERMINAL_BIN ?? "ttyd";
    const args = [
      "-p", String(this.config.TERMINAL_PORT),
      "-i", "127.0.0.1", // never exposed directly — only via the DriveHub proxy
      "-b", TERMINAL_BASE_PATH,
      "-t", "titleFixed=DriveHub terminal",
      "-t", "fontSize=14",
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

  status(): { enabled: boolean; running: boolean; path: string } {
    return {
      enabled: this.config.ENABLE_TERMINAL,
      running: this.child !== null && this.child.exitCode === null,
      path: TERMINAL_BASE_PATH,
    };
  }
}
