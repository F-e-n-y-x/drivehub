import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type DB = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: DB;
  sqlite: Database.Database;
  close: () => void;
}

/**
 * Open (or create) the SQLite database, apply pragmas for safe concurrent
 * single-writer access, and bootstrap the schema. We use idempotent DDL
 * (CREATE TABLE IF NOT EXISTS) instead of migration files so a fresh container
 * is ready with zero extra steps.
 */
export function openDatabase(dataDir: string): DbHandle {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "drivehub.sqlite");
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");

  // Bootstrap tables (idempotent).
  sqlite.exec(rawDDL());

  const db = drizzle(sqlite, { schema });
  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

/**
 * The Drizzle `sql` template is awkward to execute as raw multi-statement DDL,
 * so we keep the canonical CREATE statements here as a plain string. Kept in
 * sync with schema.ts by tests that open a fresh DB and query each table.
 */
function rawDDL(): string {
  return `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  refresh_token_enc TEXT NOT NULL,
  root_folder_id TEXT NOT NULL DEFAULT 'root',
  root_folder_name TEXT,
  start_page_token TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  quota_used INTEGER,
  quota_total INTEGER,
  last_delta_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  rel_path TEXT NOT NULL,
  type TEXT NOT NULL,
  local_hash TEXT,
  local_size INTEGER,
  local_mtime INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS items_rel_path_idx ON items (rel_path);
CREATE TABLE IF NOT EXISTS item_remotes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  drive_file_id TEXT,
  remote_hash TEXT,
  remote_modified INTEGER,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE UNIQUE INDEX IF NOT EXISTS item_remotes_pair_idx ON item_remotes (item_id, account_id);
CREATE INDEX IF NOT EXISTS item_remotes_account_idx ON item_remotes (account_id);
CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'file',
  account_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS operations_status_idx ON operations (status);
CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  rel_path TEXT NOT NULL,
  conflict_copy_path TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_email TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  level TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  rel_path TEXT,
  account_id TEXT,
  account_email TEXT
);
CREATE INDEX IF NOT EXISTS activity_at_idx ON activity (at);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
}

export { schema };
