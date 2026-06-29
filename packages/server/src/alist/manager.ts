import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { AppConfig } from "../config.js";
import { decryptSecret, encryptSecret } from "../crypto.js";
import type { Repo } from "../db/repo.js";
import type { Logger } from "../logger.js";
import type { RemotePublic } from "@drivehub/types";
import { toRemotePublic } from "../db/repo.js";
import type { RemoteService } from "../rclone/remotes.js";
import { AlistApi } from "./api.js";

const PW_KEY = "alist_admin_pw";

/**
 * Optional built-in AList. When ENABLE_ALIST is set, we run the bundled `alist`
 * binary as a managed subprocess for backends rclone can't reach (TeraBox,
 * Quark, Baidu, 115…). AList itself is infrastructure (its status lives in
 * Settings) — it is NOT shown as a remote; instead each storage the user adds
 * (e.g. via the TeraBox flow) becomes its own first-class DriveHub remote.
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

  /**
   * Add an AList-backed storage and expose it as a native DriveHub remote.
   * DriveHub talks to the AList API for the user — they never open AList.
   * `addition` is the AList driver config (e.g. { cookie } for Terabox).
   */
  async addStorage(input: {
    label: string;
    driver: string;
    addition: Record<string, unknown>;
  }): Promise<RemotePublic> {
    if (!this.enabled) throw new Error("Enable the built-in AList first (set ENABLE_ALIST=true and restart).");
    if (!this.running) throw new Error("The built-in AList isn't running yet — try again in a moment.");
    const pw = this.currentPassword();
    if (!pw) throw new Error("AList admin password unavailable.");

    const api = new AlistApi(`http://127.0.0.1:${this.config.ALIST_PORT}`, pw, this.logger);
    const slug = input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "store";
    const mountPath = `/${slug}-${nanoid(4)}`;
    await api.createStorage({ mountPath, driver: input.driver, addition: input.addition });

    // Expose it as a WebDAV-backed DriveHub remote scoped to that mount.
    const remote = await this.remotes.create({
      type: input.driver.toLowerCase() === "terabox" ? "terabox" : "alist",
      label: input.label,
      params: {
        url: `http://127.0.0.1:${this.config.ALIST_PORT}/dav${mountPath}`,
        user: "admin",
        pass: pw,
        vendor: "other",
      },
    });
    // The WebDAV plumbing (admin user, 127.0.0.1 URL) is an internal detail —
    // don't surface it on the card; just show the provider.
    this.repo.updateRemote(remote.id, { summary: JSON.stringify({}) });
    return toRemotePublic(this.repo.getRemote(remote.id)!);
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

}
