import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { SyncRepo } from "../db/repo.js";
import type { Logger } from "../logger.js";
import { isRateLimited } from "../google/drive.js";
import type { AccountRegistry } from "./accounts.js";
import type { EventBus } from "./events.js";
import { md5File } from "./hash.js";
import { conflictCopyName } from "./reconciler.js";
import { dirOf, baseOf, existsPath } from "./paths.js";

type OperationRow = ReturnType<SyncRepo["listPendingOperations"]>[number];

export interface ExecutorDeps {
  config: AppConfig;
  repo: SyncRepo;
  registry: AccountRegistry;
  bus: EventBus;
  logger: Logger;
  hubPath: string;
  /** Record an expected local content hash so the watcher can ignore the echo. */
  expectLocalWrite: (relPath: string, hash: string | null) => void;
  bumpUploaded: (bytes: number) => void;
  bumpDownloaded: (bytes: number) => void;
}

/**
 * Performs a single operation and updates the sync-state baseline so the same
 * work is never repeated. Throws on transient failure; the caller handles
 * retry/backoff. All Drive mutations are scoped to one account.
 */
export class OperationExecutor {
  constructor(private readonly d: ExecutorDeps) {}

  async execute(op: OperationRow): Promise<void> {
    switch (op.kind) {
      case "mkdir_remote":
        return this.mkdirRemote(op.relPath, op.accountId!);
      case "mkdir_local":
        return this.mkdirLocal(op.relPath);
      case "upload":
        return this.upload(op.relPath, op.accountId!);
      case "download":
        return this.download(op.relPath, op.accountId!);
      case "delete_remote":
        return this.deleteRemote(op.relPath, op.accountId!);
      case "delete_local":
        return this.deleteLocal(op.relPath);
      default:
        this.d.logger.warn({ kind: op.kind }, "unknown operation kind");
    }
  }

  private abs(relPath: string): string {
    return path.join(this.d.hubPath, relPath);
  }

  // ----- folder resolution ------------------------------------------------
  /** Ensure the Drive folder for `dirRel` exists; return its Drive file id. */
  private async ensureRemoteFolder(
    dirRel: string,
    accountId: string,
  ): Promise<string> {
    const account = this.d.repo.getAccount(accountId)!;
    if (dirRel === "" || dirRel === ".") return account.rootFolderId;

    const item = this.d.repo.getItemByPath(dirRel);
    if (item) {
      const remote = this.d.repo.getRemote(item.id, accountId);
      if (remote?.driveFileId) return remote.driveFileId;
    }

    const parentId = await this.ensureRemoteFolder(dirOf(dirRel), accountId);
    const name = baseOf(dirRel);
    const client = this.d.registry.client(accountId);
    let folder = await client.findChild(parentId, name);
    if (!folder) folder = await client.createFolder(parentId, name);

    const folderItem = this.d.repo.upsertItem({ relPath: dirRel, type: "folder" });
    this.d.repo.upsertRemote({
      itemId: folderItem.id,
      accountId,
      driveFileId: folder.id,
      remoteHash: null,
      state: "synced",
    });
    return folder.id;
  }

  // ----- operations -------------------------------------------------------
  private async mkdirRemote(relPath: string, accountId: string): Promise<void> {
    const id = await this.ensureRemoteFolder(relPath, accountId);
    this.log("success", "mkdir.remote", `Created folder on Drive: ${relPath}`, relPath, accountId);
    void id;
  }

  private async mkdirLocal(relPath: string): Promise<void> {
    await mkdir(this.abs(relPath), { recursive: true });
    this.d.repo.upsertItem({ relPath, type: "folder" });
    this.log("success", "mkdir.local", `Created local folder: ${relPath}`, relPath);
  }

  private async upload(relPath: string, accountId: string): Promise<void> {
    const abs = this.abs(relPath);
    if (!(await existsPath(abs))) {
      this.d.logger.debug({ relPath }, "upload skipped: local file vanished");
      return;
    }
    const parentId = await this.ensureRemoteFolder(dirOf(relPath), accountId);
    const hash = await md5File(abs);
    const size = (await stat(abs)).size;

    const item = this.d.repo.upsertItem({
      relPath,
      type: "file",
      localHash: hash,
      localSize: size,
      localMtime: Math.floor((await stat(abs)).mtimeMs),
    });
    const existing = this.d.repo.getRemote(item.id, accountId);
    const client = this.d.registry.client(accountId);
    const uploaded = await client.uploadFile({
      parentId,
      name: baseOf(relPath),
      localPath: abs,
      existingFileId: existing?.driveFileId ?? null,
    });

    this.d.repo.upsertRemote({
      itemId: item.id,
      accountId,
      driveFileId: uploaded.id,
      remoteHash: uploaded.md5 ?? hash,
      remoteModified: toEpoch(uploaded.modifiedTime),
      state: "synced",
    });
    this.d.bumpUploaded(size);
    this.log("success", "upload.done", `Uploaded ${relPath}`, relPath, accountId);
  }

  private async download(relPath: string, accountId: string): Promise<void> {
    const item = this.d.repo.getItemByPath(relPath);
    const remote = item ? this.d.repo.getRemote(item.id, accountId) : undefined;
    if (!remote?.driveFileId) {
      this.d.logger.debug({ relPath }, "download skipped: no remote id");
      return;
    }
    const abs = this.abs(relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    const client = this.d.registry.client(accountId);

    // Tell the watcher to expect this write so it doesn't re-trigger a sync.
    this.d.expectLocalWrite(relPath, remote.remoteHash);
    await client.downloadFile(remote.driveFileId, abs);

    const hash = await md5File(abs);
    const size = (await stat(abs)).size;
    const savedItem = this.d.repo.upsertItem({
      relPath,
      type: "file",
      localHash: hash,
      localSize: size,
      localMtime: Math.floor((await stat(abs)).mtimeMs),
    });
    // Confirm baseline for this account.
    this.d.repo.upsertRemote({
      itemId: savedItem.id,
      accountId,
      driveFileId: remote.driveFileId,
      remoteHash: hash,
      state: "synced",
    });
    this.d.expectLocalWrite(relPath, hash);
    this.d.bumpDownloaded(size);
    this.log("success", "download.done", `Downloaded ${relPath}`, relPath, accountId);
  }

  private async deleteRemote(relPath: string, accountId: string): Promise<void> {
    const item = this.d.repo.getItemByPath(relPath);
    const remote = item ? this.d.repo.getRemote(item.id, accountId) : undefined;
    if (remote?.driveFileId) {
      await this.d.registry.client(accountId).trashFile(remote.driveFileId);
    }
    if (item) {
      this.d.repo.setRemoteState(item.id, accountId, "synced");
      this.d.repo.upsertRemote({
        itemId: item.id,
        accountId,
        driveFileId: null,
        remoteHash: null,
        state: "synced",
      });
    }
    this.log("info", "delete.remote", `Removed on Drive: ${relPath}`, relPath, accountId);
  }

  private async deleteLocal(relPath: string): Promise<void> {
    const abs = this.abs(relPath);
    this.d.expectLocalWrite(relPath, null);
    await rm(abs, { recursive: true, force: true });
    this.d.repo.markItemDeleted(relPath);
    this.log("info", "delete.local", `Removed locally: ${relPath}`, relPath);
  }

  /**
   * Keep-both conflict: save the remote version as a separate copy in the hub,
   * record the conflict, then let the normal flow re-upload the local original
   * so both sides converge while nothing is lost. Returns the conflict copy
   * path so the engine can rebase the account's remote baseline.
   */
  async resolveConflict(
    relPath: string,
    accountId: string,
    now: Date,
  ): Promise<string | null> {
    const account = this.d.repo.getAccount(accountId);
    const item = this.d.repo.getItemByPath(relPath);
    const remote = item ? this.d.repo.getRemote(item.id, accountId) : undefined;
    if (!account || !remote?.driveFileId) return null;

    const copyRel = conflictCopyName(relPath, account.email, now);
    const copyAbs = this.abs(copyRel);
    await mkdir(path.dirname(copyAbs), { recursive: true });
    this.d.expectLocalWrite(copyRel, null);
    await this.d.registry.client(accountId).downloadFile(remote.driveFileId, copyAbs);

    this.d.repo.insertConflict({
      relPath,
      conflictCopyPath: copyRel,
      accountId,
      accountEmail: account.email,
    });
    const conflict = this.d.repo.listConflicts(false).find((c) => c.conflictCopyPath === copyRel);
    if (conflict) this.d.bus.emit({ type: "conflict", payload: conflict });
    this.log("warning", "conflict.created", `Conflict on ${relPath}; kept remote copy as ${copyRel}`, relPath, accountId);
    return copyRel;
  }

  isRetryable(err: unknown): boolean {
    return isRateLimited(err);
  }

  private log(
    level: "info" | "success" | "warning" | "error",
    code: string,
    message: string,
    relPath?: string,
    accountId?: string,
  ): void {
    const email = accountId ? this.d.repo.getAccount(accountId)?.email : undefined;
    const ev = this.d.repo.addActivity({
      at: Date.now(),
      level,
      code,
      message,
      relPath,
      accountId,
      accountEmail: email ?? undefined,
    });
    this.d.bus.emit({ type: "activity", payload: ev });
  }
}

function toEpoch(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}
