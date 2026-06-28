import { stat } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type {
  AccountPublic,
  AppSettings,
  EngineStatus,
  SyncStats,
} from "@drivehub/types";
import { SyncRepo, toAccountPublic } from "../db/repo.js";
import type { DB } from "../db/index.js";
import { DriveClient, type DriveFile } from "../google/drive.js";
import { AccountRegistry } from "./accounts.js";
import { EventBus } from "./events.js";
import { OperationExecutor } from "./executor.js";
import { md5File } from "./hash.js";
import { IgnoreMatcher } from "./ignore.js";
import { ABSENT, decide, type FileState } from "./reconciler.js";
import { HubWatcher, type LocalEvent } from "./watcher.js";
import { baseOf, dirOf, existsPath } from "./paths.js";

interface ExpectedWrite {
  hash: string | null;
  at: number;
}

/**
 * The SyncEngine is the brain. It owns the watcher, the per-account Drive
 * pollers, the reconciler decisions, and the executor loop. Durability lives in
 * the DB (items/operations), so a restart simply resumes from current state.
 */
export class SyncEngine {
  readonly repo: SyncRepo;
  readonly registry: AccountRegistry;
  readonly bus = new EventBus();

  private mode: "running" | "paused" = "running";
  private settings: AppSettings;
  private ignore: IgnoreMatcher;
  private watcher: HubWatcher | null = null;
  private executor: OperationExecutor;
  private pollTimers = new Map<string, NodeJS.Timeout>();
  private drainTimer: NodeJS.Timeout | null = null;
  private draining = false;
  private expected = new Map<string, ExpectedWrite>();
  private sessionUp = 0;
  private sessionDown = 0;

  constructor(
    private readonly config: AppConfig,
    db: DB,
    private readonly logger: Logger,
  ) {
    this.repo = new SyncRepo(db);
    this.settings = this.repo.getSettings();
    this.ignore = new IgnoreMatcher(this.settings.ignorePatterns);
    this.registry = new AccountRegistry(config, this.repo);
    this.executor = new OperationExecutor({
      config,
      repo: this.repo,
      registry: this.registry,
      bus: this.bus,
      logger,
      hubPath: config.HUB_PATH,
      expectLocalWrite: (rel, hash) => this.expectLocalWrite(rel, hash),
      bumpUploaded: (b) => {
        this.sessionUp += b;
      },
      bumpDownloaded: (b) => {
        this.sessionDown += b;
      },
    });
  }

  // ----- lifecycle --------------------------------------------------------
  async start(): Promise<void> {
    this.logger.info({ hub: this.config.HUB_PATH }, "starting sync engine");
    this.watcher = new HubWatcher(
      this.config.HUB_PATH,
      this.ignore,
      (ev) => void this.onLocalEvent(ev).catch((e) => this.logger.error(e)),
    );
    this.watcher.start();

    for (const account of this.registry.activeAccounts()) {
      await this.ensureStartToken(account.id);
      this.startPoller(account.id);
    }

    this.drainTimer = setInterval(() => void this.drain(), 1000);
    void this.fullReconcile();
    this.broadcastStatus();
  }

  async stop(): Promise<void> {
    if (this.drainTimer) clearInterval(this.drainTimer);
    for (const t of this.pollTimers.values()) clearInterval(t);
    this.pollTimers.clear();
    await this.watcher?.stop();
  }

  pause(): void {
    this.mode = "paused";
    this.broadcastStatus();
  }

  resume(): void {
    this.mode = "running";
    this.broadcastStatus();
    void this.drain();
  }

  applySettings(next: AppSettings): void {
    this.settings = next;
    this.repo.setSettings(next);
    this.ignore = new IgnoreMatcher(next.ignorePatterns);
    this.broadcastStatus();
  }

  /** Called by the HTTP layer after an account is connected/removed. */
  async onAccountsChanged(): Promise<void> {
    // Start pollers for any new active account.
    for (const account of this.registry.activeAccounts()) {
      if (!this.pollTimers.has(account.id)) {
        await this.ensureStartToken(account.id);
        this.startPoller(account.id);
      }
    }
    // Stop pollers for accounts that are gone/paused.
    const active = new Set(this.registry.activeAccounts().map((a) => a.id));
    for (const [id, timer] of this.pollTimers) {
      if (!active.has(id)) {
        clearInterval(timer);
        this.pollTimers.delete(id);
        this.registry.invalidate(id);
      }
    }
    void this.fullReconcile();
    this.broadcastStatus();
  }

  // ----- loop guard -------------------------------------------------------
  private expectLocalWrite(relPath: string, hash: string | null): void {
    this.expected.set(relPath, { hash, at: Date.now() });
  }

  /** True if this local event is an echo of a write the engine itself made. */
  private consumeExpected(relPath: string, hash: string | null): boolean {
    const exp = this.expected.get(relPath);
    if (!exp) return false;
    // Expire stale expectations after 30s.
    if (Date.now() - exp.at > 30_000) {
      this.expected.delete(relPath);
      return false;
    }
    if (exp.hash === hash) {
      this.expected.delete(relPath);
      return true;
    }
    return false;
  }

  // ----- local events -----------------------------------------------------
  private async onLocalEvent(ev: LocalEvent): Promise<void> {
    if (this.mode === "paused") return;
    const { relPath } = ev;

    if (ev.kind === "addDir") {
      if (this.consumeExpected(relPath, null)) return;
      this.repo.upsertItem({ relPath, type: "folder" });
      for (const acc of this.registry.activeAccounts()) {
        this.repo.enqueueOperation({ kind: "mkdir_remote", relPath, type: "folder", accountId: acc.id });
      }
      return;
    }

    if (ev.kind === "unlink" || ev.kind === "unlinkDir") {
      if (this.consumeExpected(relPath, null)) return;
      this.repo.markItemDeleted(relPath);
      if (this.settings.deletePropagation) {
        for (const acc of this.registry.activeAccounts()) {
          this.repo.enqueueOperation({ kind: "delete_remote", relPath, accountId: acc.id });
        }
      }
      return;
    }

    // add | change (a file)
    const hash = await md5File(ev.absPath).catch(() => null);
    if (hash && this.consumeExpected(relPath, hash)) return;

    const local: FileState = { exists: true, hash, type: "file" };
    for (const acc of this.registry.activeAccounts()) {
      const base = this.baseState(relPath, acc.id);
      const action = decide(local, base, base); // remote assumed unchanged on local event
      this.enqueueForAction(action, relPath, "file", acc.id);
    }
  }

  // ----- drive polling ----------------------------------------------------
  private startPoller(accountId: string): void {
    const tick = () =>
      void this.pollAccount(accountId).catch((e) =>
        this.logger.error({ err: String(e), accountId }, "poll failed"),
      );
    const timer = setInterval(tick, this.settings.pollIntervalMs);
    this.pollTimers.set(accountId, timer);
  }

  private async ensureStartToken(accountId: string): Promise<void> {
    const account = this.repo.getAccount(accountId);
    if (!account || account.startPageToken) return;
    try {
      const token = await this.registry.client(accountId).getStartPageToken();
      this.repo.updateAccount(accountId, { startPageToken: token });
    } catch (e) {
      this.logger.error({ err: String(e), accountId }, "failed to get start token");
    }
  }

  private async pollAccount(accountId: string): Promise<void> {
    if (this.mode === "paused") return;
    const account = this.repo.getAccount(accountId);
    if (!account?.startPageToken) return;
    const client = this.registry.client(accountId);

    let token: string | null = account.startPageToken;
    while (token) {
      const res = await client.listChanges(token);
      for (const change of res.changes) {
        await this.onDriveChange(accountId, change.fileId, change.removed, change.file);
      }
      if (res.newStartPageToken) {
        this.repo.updateAccount(accountId, {
          startPageToken: res.newStartPageToken,
          lastDeltaAt: Date.now(),
        });
        token = null;
      } else {
        token = res.nextPageToken;
      }
    }
  }

  private async onDriveChange(
    accountId: string,
    fileId: string,
    removed: boolean,
    file: DriveFile | null,
  ): Promise<void> {
    // Map the Drive file id to a hub-relative path.
    const existing = this.repo.findRemoteByDriveId(accountId, fileId);
    let relPath = existing
      ? this.repo.listItems().find((i) => i.id === existing.itemId)?.relPath ?? null
      : null;

    if (!relPath && file && !removed && !file.trashed) {
      relPath = await this.resolveRemotePath(accountId, file);
    }
    if (!relPath) return; // outside the synced root or unknown
    if (this.ignore.ignores(relPath)) return;

    const isFolder = file?.isFolder ?? false;
    const remoteExists = !!file && !removed && !file.trashed;
    const remote: FileState = remoteExists
      ? { exists: true, hash: file!.md5, type: isFolder ? "folder" : "file" }
      : ABSENT;

    // Record the latest remote identity so the executor can act on it.
    const item = this.repo.upsertItem({
      relPath,
      type: isFolder ? "folder" : "file",
    });
    this.repo.upsertRemote({
      itemId: item.id,
      accountId,
      driveFileId: remoteExists ? fileId : null,
      remoteHash: remoteExists ? file!.md5 : null,
      remoteModified: remoteExists ? Date.parse(file!.modifiedTime ?? "") || null : null,
      state: "pending",
    });

    const local = await this.localState(relPath);
    const base = this.baseState(relPath, accountId);
    const action = decide(local, base, remote);

    if (action === "conflict") {
      const copyRel = await this.executor.resolveConflict(relPath, accountId, new Date());
      // Rebase this account's baseline to the remote we just copied, then push
      // local back up so both sides converge (local stays canonical).
      this.repo.setRemoteState(item.id, accountId, "synced");
      this.repo.enqueueOperation({ kind: "upload", relPath, accountId });
      void copyRel;
      return;
    }
    this.enqueueForAction(action, relPath, isFolder ? "folder" : "file", accountId);
  }

  /** Walk Drive parents up to the account root to build a hub-relative path. */
  private async resolveRemotePath(
    accountId: string,
    file: DriveFile,
  ): Promise<string | null> {
    const account = this.repo.getAccount(accountId);
    if (!account) return null;
    const rootId = account.rootFolderId;
    const client = this.registry.client(accountId);

    const segments: string[] = [file.name];
    let parents = file.parents;
    let guard = 0;
    while (parents.length > 0 && guard++ < 50) {
      const parentId = parents[0]!;
      if (parentId === rootId || parentId === "root") {
        return segments.join("/");
      }
      const known = this.repo.findRemoteByDriveId(accountId, parentId);
      if (known) {
        const parentRel = this.repo
          .listItems()
          .find((i) => i.id === known.itemId)?.relPath;
        if (parentRel) return [parentRel, ...segments].join("/");
      }
      const parent = await client.getFile(parentId);
      if (!parent) return null;
      segments.unshift(parent.name);
      parents = parent.parents;
    }
    return null;
  }

  // ----- state helpers ----------------------------------------------------
  private async localState(relPath: string): Promise<FileState> {
    const abs = path.join(this.config.HUB_PATH, relPath);
    if (!(await existsPath(abs))) return ABSENT;
    const s = await stat(abs);
    if (s.isDirectory()) return { exists: true, hash: null, type: "folder" };
    const hash = await md5File(abs).catch(() => null);
    return { exists: true, hash, type: "file" };
  }

  private baseState(relPath: string, accountId: string): FileState {
    const item = this.repo.getItemByPath(relPath);
    if (!item || item.deleted) return ABSENT;
    const remote = this.repo.getRemote(item.id, accountId);
    if (!remote || !remote.driveFileId) return ABSENT;
    return {
      exists: true,
      hash: remote.remoteHash,
      type: item.type as "file" | "folder",
    };
  }

  private enqueueForAction(
    action: ReturnType<typeof decide>,
    relPath: string,
    type: "file" | "folder",
    accountId: string,
  ): void {
    switch (action) {
      case "noop":
        return;
      case "upload":
        this.repo.enqueueOperation({ kind: "upload", relPath, type, accountId });
        return;
      case "download":
        this.repo.enqueueOperation({ kind: "download", relPath, type, accountId });
        return;
      case "delete_remote":
        if (this.settings.deletePropagation)
          this.repo.enqueueOperation({ kind: "delete_remote", relPath, accountId });
        return;
      case "delete_local":
        if (this.settings.deletePropagation)
          this.repo.enqueueOperation({ kind: "delete_local", relPath });
        return;
      case "mkdir_remote":
        this.repo.enqueueOperation({ kind: "mkdir_remote", relPath, type: "folder", accountId });
        return;
      case "mkdir_local":
        this.repo.enqueueOperation({ kind: "mkdir_local", relPath, type: "folder" });
        return;
      default:
        return;
    }
  }

  // ----- executor drain ---------------------------------------------------
  private async drain(): Promise<void> {
    if (this.draining || this.mode === "paused") return;
    this.draining = true;
    try {
      const ops = this.repo.listPendingOperations(200);
      if (ops.length === 0) return;
      const limit = pLimit(this.settings.concurrency);
      await Promise.all(
        ops.map((op) =>
          limit(async () => {
            this.repo.markOperation(op.id, "running");
            try {
              await this.executor.execute(op);
              this.repo.markOperation(op.id, "done");
            } catch (err) {
              const attempts = this.repo.bumpOperationAttempts(op.id);
              const retryable = this.executor.isRetryable(err) && attempts < 5;
              this.repo.markOperation(
                op.id,
                retryable ? "pending" : "failed",
                String((err as Error)?.message ?? err),
              );
              if (!retryable) {
                this.logger.error({ op: op.kind, relPath: op.relPath, err: String(err) }, "operation failed");
              }
            }
          }),
        ),
      );
      this.repo.clearFinishedOperations();
      this.broadcastStats();
    } finally {
      this.draining = false;
    }
  }

  /** Full scan: enqueue work to converge local + each account from scratch. */
  async fullReconcile(): Promise<void> {
    // Local-driven pass: walk known items + current disk is handled by the
    // watcher's initial events on first run via add events; here we re-check
    // tracked items against each account baseline.
    for (const acc of this.registry.activeAccounts()) {
      try {
        await this.scanAccount(acc.id);
      } catch (e) {
        this.logger.error({ err: String(e), accountId: acc.id }, "account scan failed");
      }
    }
  }

  /** Recursively scan an account's Drive subtree under its root into state. */
  private async scanAccount(accountId: string): Promise<void> {
    const account = this.repo.getAccount(accountId);
    if (!account) return;
    const client = this.registry.client(accountId);
    const rootId = await client.resolveRootId(account.rootFolderId);
    if (rootId !== account.rootFolderId) {
      this.repo.updateAccount(accountId, { rootFolderId: rootId });
    }
    await this.scanFolder(client, accountId, rootId, "");
  }

  private async scanFolder(
    client: DriveClient,
    accountId: string,
    folderId: string,
    relPrefix: string,
  ): Promise<void> {
    const children = await client.listChildren(folderId);
    for (const child of children) {
      const relPath = relPrefix ? `${relPrefix}/${child.name}` : child.name;
      if (this.ignore.ignores(relPath)) continue;
      await this.onDriveChange(accountId, child.id, false, child);
      if (child.isFolder) {
        await this.scanFolder(client, accountId, child.id, relPath);
      }
    }
  }

  // ----- status broadcast -------------------------------------------------
  getStats(): SyncStats {
    return {
      itemsTracked: this.repo.listItems().filter((i) => !i.deleted).length,
      pendingOps: this.repo.countOperations("pending") + this.repo.countOperations("running"),
      conflicts: this.repo.countUnresolvedConflicts(),
      errors: this.repo.countOperations("failed"),
      uploadedBytesSession: this.sessionUp,
      downloadedBytesSession: this.sessionDown,
      lastActivityAt: this.repo.recentActivity(1)[0]?.at ?? null,
    };
  }

  getStatus(): EngineStatus {
    const accounts: AccountPublic[] = this.repo.listAccounts().map(toAccountPublic);
    return {
      mode: this.mode,
      hubPath: this.config.HUB_PATH,
      pollIntervalMs: this.settings.pollIntervalMs,
      concurrency: this.settings.concurrency,
      deletePropagation: this.settings.deletePropagation,
      accounts,
      stats: this.getStats(),
    };
  }

  private broadcastStatus(): void {
    this.bus.emit({ type: "status", payload: this.getStatus() });
  }

  private broadcastStats(): void {
    this.bus.emit({ type: "stats", payload: this.getStats() });
  }
}
