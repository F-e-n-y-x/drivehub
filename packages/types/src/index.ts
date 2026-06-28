/**
 * Shared types and contracts used by both the server and the web UI.
 * Keep this package dependency-free so it stays portable.
 */

// ---------------------------------------------------------------------------
// Sync primitives
// ---------------------------------------------------------------------------

export type ItemType = "file" | "folder";

/** Per-remote sync state for a single item on a single account. */
export type RemoteState = "synced" | "pending" | "conflict" | "error";

/** Operation the executor performs to converge state. */
export type OperationKind =
  | "upload"
  | "download"
  | "delete_local"
  | "delete_remote"
  | "mkdir_remote"
  | "mkdir_local";

export type OperationStatus = "pending" | "running" | "done" | "failed";

/** The reconciler's decision for a path (per account where relevant). */
export type ReconcileAction =
  | "noop"
  | "upload"
  | "download"
  | "delete_local"
  | "delete_remote"
  | "conflict"
  | "mkdir_remote"
  | "mkdir_local";

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type AccountStatus = "active" | "paused" | "error" | "reauth_required";

export interface AccountPublic {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  status: AccountStatus;
  /** Drive folder id this account syncs against (root of the spoke). */
  rootFolderId: string;
  rootFolderName: string | null;
  quotaUsedBytes: number | null;
  quotaTotalBytes: number | null;
  lastDeltaAt: number | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Drive viewer
// ---------------------------------------------------------------------------

export interface DriveNode {
  id: string;
  name: string;
  type: ItemType;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  /** Sync status of this node relative to the hub, when known. */
  syncState: RemoteState | "unknown";
  iconLink?: string | null;
}

export interface DriveListing {
  accountId: string;
  folderId: string;
  breadcrumbs: Array<{ id: string; name: string }>;
  nodes: DriveNode[];
}

// ---------------------------------------------------------------------------
// Activity & status
// ---------------------------------------------------------------------------

export type ActivityLevel = "info" | "success" | "warning" | "error";

export interface ActivityEvent {
  id: string;
  at: number;
  level: ActivityLevel;
  /** Machine-readable code, e.g. "upload.done", "conflict.created". */
  code: string;
  message: string;
  relPath?: string;
  accountId?: string;
  accountEmail?: string;
}

export interface SyncStats {
  itemsTracked: number;
  pendingOps: number;
  conflicts: number;
  errors: number;
  uploadedBytesSession: number;
  downloadedBytesSession: number;
  lastActivityAt: number | null;
}

export type EngineMode = "running" | "paused";

export interface EngineStatus {
  mode: EngineMode;
  hubPath: string;
  pollIntervalMs: number;
  concurrency: number;
  deletePropagation: boolean;
  accounts: AccountPublic[];
  stats: SyncStats;
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

export interface ConflictRecord {
  id: string;
  relPath: string;
  conflictCopyPath: string;
  accountId: string;
  accountEmail: string;
  detectedAt: number;
  resolved: boolean;
}

export type ConflictResolution = "keep_local" | "keep_remote" | "keep_both";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppSettings {
  pollIntervalMs: number;
  concurrency: number;
  deletePropagation: boolean;
  ignorePatterns: string[];
  theme: "light" | "dark" | "system";
}

// ---------------------------------------------------------------------------
// Server-Sent Events envelope (server -> browser)
// ---------------------------------------------------------------------------

export type ServerEvent =
  | { type: "status"; payload: EngineStatus }
  | { type: "activity"; payload: ActivityEvent }
  | { type: "stats"; payload: SyncStats }
  | { type: "account"; payload: AccountPublic }
  | { type: "conflict"; payload: ConflictRecord };

// ---------------------------------------------------------------------------
// REST response helpers
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  message: string;
}
