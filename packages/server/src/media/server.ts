import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import net from "node:net";
import type { Logger } from "../logger.js";

interface ServeEntry {
  port: number;
  child: ChildProcess;
  lastUsed: number;
  ready: Promise<void>;
}

const IDLE_MS = 10 * 60_000; // shut a server down after 10 min unused
const SWEEP_MS = 60_000;

/**
 * On-demand `rclone serve http` instances with a VFS read cache, one per
 * remote. Streaming preview bytes through these (instead of a fresh
 * `rclone cat` per Range) gives instant seeks, chunked read-ahead, and cached
 * re-watches — far less backend egress for video. Servers are spawned lazily,
 * reused, and reaped when idle.
 */
export class MediaServerManager {
  private servers = new Map<string, ServeEntry>();
  private sweep: NodeJS.Timeout | null = null;

  constructor(
    private readonly bin: string,
    private readonly confPath: string,
    private readonly cacheDir: string,
    private readonly logger: Logger,
  ) {}

  /** Build a local HTTP URL that serves `subPath` of `remoteName` via the VFS. */
  async urlFor(remoteName: string, subPath: string): Promise<string> {
    const entry = await this.ensure(remoteName);
    entry.lastUsed = Date.now();
    const encoded = subPath
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    return `http://127.0.0.1:${entry.port}/${encoded}`;
  }

  private async ensure(remoteName: string): Promise<ServeEntry> {
    const existing = this.servers.get(remoteName);
    if (existing && existing.child.exitCode === null) {
      await existing.ready;
      return existing;
    }

    mkdirSync(this.cacheDir, { recursive: true });
    const port = await freePort();
    const args = [
      "serve", "http", `${remoteName}:`,
      "--addr", `127.0.0.1:${port}`,
      "--read-only",
      "--vfs-cache-mode", "full",
      "--vfs-cache-max-age", "1h",
      "--vfs-cache-max-size", "4G",
      "--vfs-read-chunk-size", "32M",
      "--vfs-read-chunk-size-limit", "512M",
      "--no-modtime",
      "--cache-dir", this.cacheDir,
      "--config", this.confPath,
    ];
    const child = spawn(this.bin, args, { windowsHide: true });
    child.stdout?.resume();
    child.stderr?.resume();
    const ready = waitForPort(port, 8000);
    const entry: ServeEntry = { port, child, lastUsed: Date.now(), ready };
    this.servers.set(remoteName, entry);
    this.logger.debug({ remoteName, port }, "started rclone serve http (vfs cache)");

    child.on("exit", (code) => {
      if (this.servers.get(remoteName) === entry) this.servers.delete(remoteName);
      this.logger.debug({ remoteName, code }, "rclone serve http exited");
    });

    this.startSweep();
    await ready;
    return entry;
  }

  private startSweep(): void {
    if (this.sweep) return;
    this.sweep = setInterval(() => {
      const now = Date.now();
      for (const [name, e] of this.servers) {
        if (now - e.lastUsed > IDLE_MS) {
          e.child.kill();
          this.servers.delete(name);
        }
      }
      if (this.servers.size === 0 && this.sweep) {
        clearInterval(this.sweep);
        this.sweep = null;
      }
    }, SWEEP_MS);
    this.sweep.unref?.();
  }

  stopAll(): void {
    if (this.sweep) {
      clearInterval(this.sweep);
      this.sweep = null;
    }
    for (const e of this.servers.values()) e.child.kill();
    this.servers.clear();
  }
}

/** Ask the OS for an unused localhost port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Resolve once something is accepting connections on the port (or reject). */
function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error("rclone serve did not start in time"));
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}
