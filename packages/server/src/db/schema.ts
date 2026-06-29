import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * v2 schema: provider-agnostic Remotes + Jobs + run history. rclone is the
 * transfer engine, so we don't track per-file state here — we track the
 * configured endpoints, the jobs between them, and what happened on each run.
 */

export const remotes = sqliteTable(
  "remotes",
  {
    id: text("id").primaryKey(),
    /** rclone remote name (sanitized, unique). */
    name: text("name").notNull(),
    type: text("type").notNull(),
    label: text("label").notNull(),
    /** Full rclone config (incl. secrets) as encrypted JSON. */
    configEnc: text("config_enc").notNull(),
    /** Non-secret summary for the UI, as JSON. */
    summary: text("summary").notNull().default("{}"),
    status: text("status").notNull().default("ok"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    nameIdx: uniqueIndex("remotes_name_idx").on(t.name),
  }),
);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("sync"),
  sourceRemoteId: text("source_remote_id").notNull(),
  sourcePath: text("source_path").notNull().default(""),
  destRemoteId: text("dest_remote_id").notNull(),
  destPath: text("dest_path").notNull().default(""),
  mode: text("mode").notNull().default("mirror"),
  scheduleJson: text("schedule_json").notNull().default("{\"kind\":\"manual\"}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  snapshotJson: text("snapshot_json")
    .notNull()
    .default("{\"retentionKeep\":7,\"compressionLevel\":6}"),
  quiesceJson: text("quiesce_json").notNull().default("[]"),
  lastRunAt: integer("last_run_at"),
  lastStatus: text("last_status").notNull().default("idle"),
  lastError: text("last_error"),
  nextRunAt: integer("next_run_at"),
  createdAt: integer("created_at").notNull(),
});

export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
    status: text("status").notNull().default("running"),
    bytesTransferred: integer("bytes_transferred").notNull().default(0),
    filesTransferred: integer("files_transferred").notNull().default(0),
    message: text("message"),
  },
  (t) => ({
    jobIdx: index("job_runs_job_idx").on(t.jobId),
  }),
);

export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    at: integer("at").notNull(),
    level: text("level").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    jobId: text("job_id"),
    remoteId: text("remote_id"),
  },
  (t) => ({
    atIdx: index("activity_at_idx").on(t.at),
  }),
);

export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
