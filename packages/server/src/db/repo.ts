import { and, desc, eq, inArray, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  AccountPublic,
  AppSettings,
  ConflictRecord,
  ActivityEvent,
  OperationKind,
  RemoteState,
} from "@drivehub/types";
import type { DB } from "./index.js";
import {
  accounts,
  activity,
  conflicts,
  itemRemotes,
  items,
  kv,
  operations,
} from "./schema.js";

const SETTINGS_KEY = "settings";

export const DEFAULT_SETTINGS: AppSettings = {
  pollIntervalMs: 7000,
  concurrency: 4,
  deletePropagation: true,
  ignorePatterns: [
    ".git/**",
    "node_modules/**",
    "**/*.tmp",
    "**/.DS_Store",
    "**/Thumbs.db",
    "**/~$*",
  ],
  theme: "system",
};

type AccountRow = typeof accounts.$inferSelect;
type ItemRow = typeof items.$inferSelect;
type ItemRemoteRow = typeof itemRemotes.$inferSelect;

export interface ItemWithRemotes {
  item: ItemRow;
  remotes: ItemRemoteRow[];
}

/**
 * SyncRepo is the single typed gateway to the sync-state store. Keeping all SQL
 * in one place makes the reconciler and executor easy to reason about and test.
 */
export class SyncRepo {
  constructor(private readonly db: DB) {}

  // ----- accounts ---------------------------------------------------------
  listAccounts(): AccountRow[] {
    return this.db.select().from(accounts).all();
  }

  getAccount(id: string): AccountRow | undefined {
    return this.db.select().from(accounts).where(eq(accounts.id, id)).get();
  }

  getAccountByEmail(email: string): AccountRow | undefined {
    return this.db
      .select()
      .from(accounts)
      .where(eq(accounts.email, email))
      .get();
  }

  insertAccount(row: Omit<AccountRow, "id"> & { id?: string }): AccountRow {
    const id = row.id ?? `acc_${nanoid(12)}`;
    this.db
      .insert(accounts)
      .values({ ...row, id })
      .run();
    return this.getAccount(id)!;
  }

  updateAccount(id: string, patch: Partial<AccountRow>): void {
    this.db.update(accounts).set(patch).where(eq(accounts.id, id)).run();
  }

  deleteAccount(id: string): void {
    this.db.delete(accounts).where(eq(accounts.id, id)).run();
  }

  // ----- items ------------------------------------------------------------
  getItemByPath(relPath: string): ItemRow | undefined {
    return this.db.select().from(items).where(eq(items.relPath, relPath)).get();
  }

  listItems(): ItemRow[] {
    return this.db.select().from(items).all();
  }

  upsertItem(input: {
    relPath: string;
    type: "file" | "folder";
    localHash?: string | null;
    localSize?: number | null;
    localMtime?: number | null;
    deleted?: boolean;
  }): ItemRow {
    const now = Date.now();
    const existing = this.getItemByPath(input.relPath);
    if (existing) {
      this.db
        .update(items)
        .set({
          type: input.type,
          localHash: input.localHash ?? existing.localHash,
          localSize: input.localSize ?? existing.localSize,
          localMtime: input.localMtime ?? existing.localMtime,
          deleted: input.deleted ?? existing.deleted,
          updatedAt: now,
        })
        .where(eq(items.id, existing.id))
        .run();
      return this.getItemByPath(input.relPath)!;
    }
    const id = `itm_${nanoid(12)}`;
    this.db
      .insert(items)
      .values({
        id,
        relPath: input.relPath,
        type: input.type,
        localHash: input.localHash ?? null,
        localSize: input.localSize ?? null,
        localMtime: input.localMtime ?? null,
        deleted: input.deleted ?? false,
        updatedAt: now,
      })
      .run();
    return this.getItemByPath(input.relPath)!;
  }

  markItemDeleted(relPath: string): void {
    const item = this.getItemByPath(relPath);
    if (!item) return;
    this.db
      .update(items)
      .set({ deleted: true, localHash: null, updatedAt: Date.now() })
      .where(eq(items.id, item.id))
      .run();
  }

  removeItem(relPath: string): void {
    const item = this.getItemByPath(relPath);
    if (!item) return;
    this.db.delete(items).where(eq(items.id, item.id)).run();
  }

  // ----- item_remotes -----------------------------------------------------
  getRemote(itemId: string, accountId: string): ItemRemoteRow | undefined {
    return this.db
      .select()
      .from(itemRemotes)
      .where(
        and(eq(itemRemotes.itemId, itemId), eq(itemRemotes.accountId, accountId)),
      )
      .get();
  }

  listRemotesForItem(itemId: string): ItemRemoteRow[] {
    return this.db
      .select()
      .from(itemRemotes)
      .where(eq(itemRemotes.itemId, itemId))
      .all();
  }

  upsertRemote(input: {
    itemId: string;
    accountId: string;
    driveFileId?: string | null;
    remoteHash?: string | null;
    remoteModified?: number | null;
    state: RemoteState;
  }): ItemRemoteRow {
    const existing = this.getRemote(input.itemId, input.accountId);
    if (existing) {
      this.db
        .update(itemRemotes)
        .set({
          driveFileId: input.driveFileId ?? existing.driveFileId,
          remoteHash:
            input.remoteHash === undefined ? existing.remoteHash : input.remoteHash,
          remoteModified: input.remoteModified ?? existing.remoteModified,
          state: input.state,
        })
        .where(eq(itemRemotes.id, existing.id))
        .run();
      return this.getRemote(input.itemId, input.accountId)!;
    }
    const id = `rmt_${nanoid(12)}`;
    this.db
      .insert(itemRemotes)
      .values({
        id,
        itemId: input.itemId,
        accountId: input.accountId,
        driveFileId: input.driveFileId ?? null,
        remoteHash: input.remoteHash ?? null,
        remoteModified: input.remoteModified ?? null,
        state: input.state,
      })
      .run();
    return this.getRemote(input.itemId, input.accountId)!;
  }

  setRemoteState(itemId: string, accountId: string, state: RemoteState): void {
    this.db
      .update(itemRemotes)
      .set({ state })
      .where(
        and(eq(itemRemotes.itemId, itemId), eq(itemRemotes.accountId, accountId)),
      )
      .run();
  }

  findRemoteByDriveId(
    accountId: string,
    driveFileId: string,
  ): ItemRemoteRow | undefined {
    return this.db
      .select()
      .from(itemRemotes)
      .where(
        and(
          eq(itemRemotes.accountId, accountId),
          eq(itemRemotes.driveFileId, driveFileId),
        ),
      )
      .get();
  }

  // ----- operations -------------------------------------------------------
  enqueueOperation(input: {
    kind: OperationKind;
    relPath: string;
    type?: "file" | "folder";
    accountId?: string | null;
  }): void {
    const now = Date.now();
    this.db
      .insert(operations)
      .values({
        id: `op_${nanoid(12)}`,
        kind: input.kind,
        relPath: input.relPath,
        type: input.type ?? "file",
        accountId: input.accountId ?? null,
        attempts: 0,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  listPendingOperations(limit = 100): (typeof operations.$inferSelect)[] {
    return this.db
      .select()
      .from(operations)
      .where(inArray(operations.status, ["pending", "running"]))
      .limit(limit)
      .all();
  }

  countOperations(status: "pending" | "running" | "done" | "failed"): number {
    const rows = this.db
      .select()
      .from(operations)
      .where(eq(operations.status, status))
      .all();
    return rows.length;
  }

  markOperation(
    id: string,
    status: "pending" | "running" | "done" | "failed",
    error?: string,
  ): void {
    this.db
      .update(operations)
      .set({ status, error: error ?? null, updatedAt: Date.now() })
      .where(eq(operations.id, id))
      .run();
  }

  bumpOperationAttempts(id: string): number {
    const row = this.db
      .select()
      .from(operations)
      .where(eq(operations.id, id))
      .get();
    const attempts = (row?.attempts ?? 0) + 1;
    this.db
      .update(operations)
      .set({ attempts, updatedAt: Date.now() })
      .where(eq(operations.id, id))
      .run();
    return attempts;
  }

  clearFinishedOperations(): void {
    this.db.delete(operations).where(eq(operations.status, "done")).run();
  }

  // ----- conflicts --------------------------------------------------------
  insertConflict(input: {
    relPath: string;
    conflictCopyPath: string;
    accountId: string;
    accountEmail: string;
  }): ConflictRecord {
    const id = `cf_${nanoid(12)}`;
    const detectedAt = Date.now();
    this.db
      .insert(conflicts)
      .values({ id, ...input, detectedAt, resolved: false })
      .run();
    return { id, ...input, detectedAt, resolved: false };
  }

  listConflicts(includeResolved = false): ConflictRecord[] {
    const rows = includeResolved
      ? this.db.select().from(conflicts).all()
      : this.db
          .select()
          .from(conflicts)
          .where(eq(conflicts.resolved, false))
          .all();
    return rows.map((r) => ({
      id: r.id,
      relPath: r.relPath,
      conflictCopyPath: r.conflictCopyPath,
      accountId: r.accountId,
      accountEmail: r.accountEmail,
      detectedAt: r.detectedAt,
      resolved: r.resolved,
    }));
  }

  resolveConflict(id: string): void {
    this.db
      .update(conflicts)
      .set({ resolved: true })
      .where(eq(conflicts.id, id))
      .run();
  }

  countUnresolvedConflicts(): number {
    return this.listConflicts(false).length;
  }

  // ----- activity ---------------------------------------------------------
  addActivity(ev: Omit<ActivityEvent, "id">): ActivityEvent {
    const id = `act_${nanoid(12)}`;
    this.db
      .insert(activity)
      .values({
        id,
        at: ev.at,
        level: ev.level,
        code: ev.code,
        message: ev.message,
        relPath: ev.relPath ?? null,
        accountId: ev.accountId ?? null,
        accountEmail: ev.accountEmail ?? null,
      })
      .run();
    return { id, ...ev };
  }

  recentActivity(limit = 100, search?: string): ActivityEvent[] {
    const base = this.db.select().from(activity);
    const rows = (
      search
        ? base.where(like(activity.message, `%${search}%`))
        : base
    )
      .orderBy(desc(activity.at))
      .limit(limit)
      .all();
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      level: r.level as ActivityEvent["level"],
      code: r.code,
      message: r.message,
      relPath: r.relPath ?? undefined,
      accountId: r.accountId ?? undefined,
      accountEmail: r.accountEmail ?? undefined,
    }));
  }

  // ----- settings (kv) ----------------------------------------------------
  getSettings(): AppSettings {
    const row = this.db.select().from(kv).where(eq(kv.key, SETTINGS_KEY)).get();
    if (!row) return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  setSettings(settings: AppSettings): void {
    const value = JSON.stringify(settings);
    const existing = this.db
      .select()
      .from(kv)
      .where(eq(kv.key, SETTINGS_KEY))
      .get();
    if (existing) {
      this.db.update(kv).set({ value }).where(eq(kv.key, SETTINGS_KEY)).run();
    } else {
      this.db.insert(kv).values({ key: SETTINGS_KEY, value }).run();
    }
  }
}

/** Map an account DB row to the public (no-secrets) shape used by the API. */
export function toAccountPublic(row: AccountRow): AccountPublic {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    status: row.status as AccountPublic["status"],
    rootFolderId: row.rootFolderId,
    rootFolderName: row.rootFolderName,
    quotaUsedBytes: row.quotaUsed,
    quotaTotalBytes: row.quotaTotal,
    lastDeltaAt: row.lastDeltaAt,
    createdAt: row.createdAt,
  };
}
