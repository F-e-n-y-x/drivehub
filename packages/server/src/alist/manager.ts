import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { AppConfig } from "../config.js";
import { decryptSecret, encryptSecret } from "../crypto.js";
import type { Repo } from "../db/repo.js";
import type { Logger } from "../logger.js";
import type { RemoteService } from "../rclone/remotes.js";

const PW_KEY = "alist_admin_pw";
const REMOTE_KEY = "alist_remote_created";

/**
 * Optional built-in AList. When ENABLE_ALIST is set, we run the bundled `alist`
 * binary as a managed subprocess, bootstrap an admin password, and auto-create
 * a WebDAV remote pointing at it — so users get TeraBox/Quark/Baidu/115/etc.
 * through one DriveHub remote without standing up a second container.
 *
 * Everything here is best-effort and gated: failures are logged, never thrown,
 * so they can't take down the core app.
 */
export class AlistManager {
  private child: ChildProcess | null = null;
  private running = false;
  private readonly dataDir: string;
  private readonly bin: string;

  constructor(
    private readonly config: AppConfig,
    private readonly repo: Repo,
    private readonly remotes: RemoteService,
    private readonly logger: Logger,
  ) {
    this.dataDir = path.join(config.DATA_DIR, "alist");
    this.bin = config.ALIST_BIN ?? "alist";
  }

  get enabled(): boolean {
    return this.config.ENABLE_ALIST;
  }

  status(): {
    enabled: boolean;
    running: boolean;
    port: number;
    adminUser: string;
    adminPassword: string | null;
  } {
    return {
      enabled: this.enabled,
      running: this.running,
      port: this.config.ALIST_PORT,
      adminUser: "admin",
      // Single-user, LAN self-hosted tool with no auth of its own, so it's fine
      // to surface the built-in AList password the user needs to sign in.
      adminPassword: this.enabled ? this.currentPassword() : null,
    };
  }

  private currentPassword(): string | null {
    if (this.config.ALIST_ADMIN_PASSWORD) return this.config.ALIST_ADMIN_PASSWORD;
    const stored = this.repo.kvGet(PW_KEY);
    if (!stored) return null;
    try {
      return decryptSecret(stored, this.config.TOKEN_ENCRYPTION_KEY);
    } catch {
      return null;
    }
  }

  async start(): Promise<void> {
    if (!this.enabled) return;
    try {
      await mkdir(this.dataDir, { recursive: true });
      const pw = this.ensurePassword();
      await this.setAdminPassword(pw);
      this.spawnServer();
      await this.waitForReady();
      await this.ensureRemote(pw);
      this.logger.info({ port: this.config.ALIST_PORT }, "built-in AList ready");
    } catch (e) {
      this.logger.error({ err: String(e) }, "built-in AList failed to start (continuing without it)");
    }
  }

  stop(): void {
    this.running = false;
    this.child?.kill();
    this.child = null;
  }

  private ensurePassword(): string {
    // An explicit env password always wins (and is kept in sync on AList).
    if (this.config.ALIST_ADMIN_PASSWORD) {
      this.repo.kvSet(PW_KEY, encryptSecret(this.config.ALIST_ADMIN_PASSWORD, this.config.TOKEN_ENCRYPTION_KEY));
      return this.config.ALIST_ADMIN_PASSWORD;
    }
    const existing = this.repo.kvGet(PW_KEY);
    if (existing) {
      try {
        return decryptSecret(existing, this.config.TOKEN_ENCRYPTION_KEY);
      } catch {
        /* regenerate below */
      }
    }
    const pw = `dh_${nanoid(20)}`;
    this.repo.kvSet(PW_KEY, encryptSecret(pw, this.config.TOKEN_ENCRYPTION_KEY));
    return pw;
  }

  private setAdminPassword(pw: string): Promise<void> {
    return new Promise((resolve) => {
      const p = spawn(this.bin, ["admin", "set", pw, "--data", this.dataDir], { windowsHide: true });
      p.on("error", () => resolve());
      p.on("close", () => resolve());
    });
  }

  private spawnServer(): void {
    this.child = spawn(this.bin, ["server", "--data", this.dataDir], { windowsHide: true });
    this.child.stdout?.on("data", (d) =>
      this.logger.debug({ alist: String(d).trim().slice(0, 300) }, "alist"),
    );
    this.child.stderr?.on("data", (d) =>
      this.logger.debug({ alist: String(d).trim().slice(0, 300) }, "alist"),
    );
    this.child.on("exit", (code) => {
      this.running = false;
      this.logger.warn({ code }, "built-in AList exited");
    });
  }

  private async waitForReady(): Promise<void> {
    const url = `http://127.0.0.1:${this.config.ALIST_PORT}/ping`;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          this.running = true;
          return;
        }
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("AList did not become ready within 30s");
  }

  /** Create a managed WebDAV remote pointing at the built-in AList, once. */
  private async ensureRemote(pw: string): Promise<void> {
    if (this.repo.kvGet(REMOTE_KEY)) return;
    await this.remotes.create({
      type: "alist",
      label: "AList (built-in)",
      params: {
        url: `http://127.0.0.1:${this.config.ALIST_PORT}/dav`,
        user: "admin",
        pass: pw,
        vendor: "other",
      },
    });
    this.repo.kvSet(REMOTE_KEY, "1");
  }
}
