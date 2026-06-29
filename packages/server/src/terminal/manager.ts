import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";

/**
 * Optional built-in web terminal — a managed `ttyd` subprocess that serves an
 * in-browser shell into the container (handy for `rclone config`/`authorize`,
 * S3/SFTP/WebDAV setup, and debugging without installing rclone elsewhere).
 *
 * OFF by default (ENABLE_TERMINAL): it is a full shell on an app that ships
 * unauthenticated, so it always runs behind HTTP basic auth and binds its own
 * port. Treat it as LAN/single-user only.
 */
export class TerminalManager {
  private child: ChildProcess | null = null;
  private readonly password: string;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.password = config.TERMINAL_PASSWORD || randomBytes(9).toString("base64url");
  }

  get enabled(): boolean {
    return this.config.ENABLE_TERMINAL;
  }

  start(): void {
    if (!this.config.ENABLE_TERMINAL) return;
    const bin = this.config.TERMINAL_BIN ?? "ttyd";
    const args = [
      "-p", String(this.config.TERMINAL_PORT),
      "-i", "0.0.0.0",
      "-c", `${this.config.TERMINAL_USER}:${this.password}`,
      "-t", "titleFixed=DriveHub terminal",
      "-W", // writable input
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

  status(): {
    enabled: boolean;
    running: boolean;
    port: number;
    user: string;
    password: string | null;
  } {
    return {
      enabled: this.config.ENABLE_TERMINAL,
      running: this.child !== null && this.child.exitCode === null,
      port: this.config.TERMINAL_PORT,
      user: this.config.TERMINAL_USER,
      password: this.config.ENABLE_TERMINAL ? this.password : null,
    };
  }
}
