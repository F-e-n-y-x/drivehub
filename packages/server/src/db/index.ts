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
CREATE TABLE IF NOT EXISTS remotes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  config_enc TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ok',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS remotes_name_idx ON remotes (name);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'sync',
  source_remote_id TEXT NOT NULL,
  source_path TEXT NOT NULL DEFAULT '',
  dest_remote_id TEXT NOT NULL,
  dest_path TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'mirror',
  schedule_json TEXT NOT NULL DEFAULT '{"kind":"manual"}',
  enabled INTEGER NOT NULL DEFAULT 1,
  snapshot_json TEXT NOT NULL DEFAULT '{"retentionKeep":7,"compressionLevel":6}',
  quiesce_json TEXT NOT NULL DEFAULT '[]',
  last_run_at INTEGER,
  last_status TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  bytes_transferred INTEGER NOT NULL DEFAULT 0,
  files_transferred INTEGER NOT NULL DEFAULT 0,
  message TEXT
);
CREATE INDEX IF NOT EXISTS job_runs_job_idx ON job_runs (job_id);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  level TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  job_id TEXT,
  remote_id TEXT
);
CREATE INDEX IF NOT EXISTS activity_at_idx ON activity (at);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
}

export { schema };
