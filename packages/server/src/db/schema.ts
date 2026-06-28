import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema = the sync-state store. This is the source of "last-synced
 * truth" the reconciler compares against. See the design doc, section 5.2.
 */

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  picture: text("picture"),
  // AES-256-GCM encrypted refresh token (base64).
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  rootFolderId: text("root_folder_id").notNull().default("root"),
  rootFolderName: text("root_folder_name"),
  startPageToken: text("start_page_token"),
  status: text("status").notNull().default("active"),
  quotaUsed: integer("quota_used"),
  quotaTotal: integer("quota_total"),
  lastDeltaAt: integer("last_delta_at"),
  createdAt: integer("created_at").notNull(),
});

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    relPath: text("rel_path").notNull(),
    type: text("type").notNull(), // file | folder
    localHash: text("local_hash"),
    localSize: integer("local_size"),
    localMtime: integer("local_mtime"),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    relPathIdx: uniqueIndex("items_rel_path_idx").on(t.relPath),
  }),
);

export const itemRemotes = sqliteTable(
  "item_remotes",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    driveFileId: text("drive_file_id"),
    remoteHash: text("remote_hash"),
    remoteModified: integer("remote_modified"),
    state: text("state").notNull().default("pending"),
  },
  (t) => ({
    pairIdx: uniqueIndex("item_remotes_pair_idx").on(t.itemId, t.accountId),
    accountIdx: index("item_remotes_account_idx").on(t.accountId),
  }),
);

export const operations = sqliteTable(
  "operations",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    relPath: text("rel_path").notNull(),
    type: text("type").notNull().default("file"),
    accountId: text("account_id"),
    attempts: integer("attempts").notNull().default(0),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    statusIdx: index("operations_status_idx").on(t.status),
  }),
);

export const conflicts = sqliteTable("conflicts", {
  id: text("id").primaryKey(),
  relPath: text("rel_path").notNull(),
  conflictCopyPath: text("conflict_copy_path").notNull(),
  accountId: text("account_id").notNull(),
  accountEmail: text("account_email").notNull(),
  detectedAt: integer("detected_at").notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
});

export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    at: integer("at").notNull(),
    level: text("level").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    relPath: text("rel_path"),
    accountId: text("account_id"),
    accountEmail: text("account_email"),
  },
  (t) => ({
    atIdx: index("activity_at_idx").on(t.at),
  }),
);

/** Simple key/value store for settings and engine cursors. */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
