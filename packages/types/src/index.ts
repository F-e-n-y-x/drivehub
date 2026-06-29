/**
 * Shared types and contracts used by both the server and the web UI.
 * Keep this package dependency-free so it stays portable.
 *
 * v2: DriveHub is a provider-agnostic backup/sync tool built around two
 * concepts — Remotes (storage endpoints) and Jobs (source -> destination,
 * with a mode and a schedule). The engine is powered by rclone.
 */

// ---------------------------------------------------------------------------
// Remotes (storage endpoints)
// ---------------------------------------------------------------------------

export type RemoteType =
  | "local"
  | "s3"
  | "b2"
  | "drive"
  | "dropbox"
  | "onedrive"
  | "webdav"
  | "sftp";

export type RemoteStatus = "ok" | "error" | "unconfigured";

/** Whether a remote type authenticates via OAuth (needs the connect flow). */
export const OAUTH_REMOTE_TYPES: RemoteType[] = ["drive", "dropbox", "onedrive"];

export interface RemotePublic {
  id: string;
  /** rclone remote name (sanitized, unique). */
  name: string;
  type: RemoteType;
  /** User-friendly label shown in the UI. */
  label: string;
  /** Non-secret config summary (bucket, endpoint, account email, path...). */
  summary: Record<string, string>;
  status: RemoteStatus;
  createdAt: number;
}

/** Catalog entry describing the fields a remote type needs in the UI. */
export interface RemoteTypeField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "boolean";
  required: boolean;
  placeholder?: string;
  help?: string;
}

export interface RemoteTypeInfo {
  type: RemoteType;
  label: string;
  oauth: boolean;
  description: string;
  fields: RemoteTypeField[];
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * mirror   -> rclone sync (destination becomes identical; extra files deleted)
 * additive -> rclone copy (never deletes on destination)
 * two_way  -> rclone bisync (both directions, conflict-aware)
 */
export type JobMode = "two_way" | "mirror" | "additive";

export type JobType = "sync" | "snapshot";

export type ScheduleKind =
  | "realtime"
  | "interval"
  | "daily"
  | "weekly"
  | "manual";

export interface Schedule {
  kind: ScheduleKind;
  /** for interval */
  intervalMinutes?: number;
  /** "HH:MM" for daily/weekly */
  timeOfDay?: string;
  /** 0 (Sun) - 6 (Sat) for weekly */
  weekday?: number;
}

export interface SnapshotOptions {
  /** Keep at most this many archives; older ones are pruned. */
  retentionKeep: number;
  /** gzip level 0-9. */
  compressionLevel: number;
}

export type JobStatus = "idle" | "queued" | "running" | "success" | "error";

export interface JobPublic {
  id: string;
  name: string;
  type: JobType;
  sourceRemoteId: string;
  sourcePath: string;
  destRemoteId: string;
  destPath: string;
  mode: JobMode;
  schedule: Schedule;
  enabled: boolean;
  /** Only meaningful when type === "snapshot". */
  snapshot: SnapshotOptions;
  /** Docker container names to pause during a snapshot for DB consistency. */
  quiesceContainers: string[];
  lastRunAt: number | null;
  lastStatus: JobStatus;
  lastError: string | null;
  nextRunAt: number | null;
  createdAt: number;
}

export interface JobInput {
  name: string;
  type: JobType;
  sourceRemoteId: string;
  sourcePath: string;
  destRemoteId: string;
  destPath: string;
  mode: JobMode;
  schedule: Schedule;
  enabled: boolean;
  snapshot: SnapshotOptions;
  quiesceContainers: string[];
}

export interface JobRun {
  id: string;
  jobId: string;
  startedAt: number;
  finishedAt: number | null;
  status: JobStatus;
  bytesTransferred: number;
  filesTransferred: number;
  message: string | null;
}

/** Live progress for a running job (server -> browser). */
export interface JobProgress {
  jobId: string;
  runId: string;
  status: JobStatus;
  bytes: number;
  totalBytes: number;
  files: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  currentFile: string | null;
}

// ---------------------------------------------------------------------------
// Remote browser (rclone lsjson)
// ---------------------------------------------------------------------------

export interface RemoteEntry {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  modTime: string | null;
  mimeType: string | null;
}

export interface RemoteListing {
  remoteId: string;
  path: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  entries: RemoteEntry[];
}

// ---------------------------------------------------------------------------
// Activity & status
// ---------------------------------------------------------------------------

export type ActivityLevel = "info" | "success" | "warning" | "error";

export interface ActivityEvent {
  id: string;
  at: number;
  level: ActivityLevel;
  code: string;
  message: string;
  jobId?: string;
  remoteId?: string;
}

export interface AppStats {
  remotes: number;
  jobs: number;
  jobsEnabled: number;
  runningJobs: number;
  lastErrorAt: number | null;
  bytesTransferredSession: number;
}

export type EngineMode = "running" | "paused";

export interface EngineStatus {
  mode: EngineMode;
  rcloneVersion: string | null;
  rcloneAvailable: boolean;
  dockerAvailable: boolean;
  stats: AppStats;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppSettings {
  /** Default concurrency passed to rclone transfers. */
  concurrency: number;
  /** Global ignore/exclude globs applied to all jobs. */
  excludePatterns: string[];
  /** Bandwidth limit, rclone --bwlimit syntax (e.g. "10M", "" = unlimited). */
  bandwidthLimit: string;
  theme: "light" | "dark" | "system";
}

// ---------------------------------------------------------------------------
// Server-Sent Events envelope (server -> browser)
// ---------------------------------------------------------------------------

export type ServerEvent =
  | { type: "status"; payload: EngineStatus }
  | { type: "activity"; payload: ActivityEvent }
  | { type: "remote"; payload: RemotePublic }
  | { type: "job"; payload: JobPublic }
  | { type: "progress"; payload: JobProgress }
  | { type: "run"; payload: JobRun };

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  message: string;
}

export interface OkResponse {
  ok: true;
}
