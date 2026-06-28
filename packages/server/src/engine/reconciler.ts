import type { ReconcileAction } from "@drivehub/types";

/**
 * The reconciler is a PURE function. Given three snapshots of an item —
 * `local` (the hub now), `base` (last-synced truth for this local<->account
 * pairing), and `remote` (the account's Drive now) — it returns the single
 * action that converges them. No I/O here so the full decision matrix can be
 * unit-tested exhaustively. See design doc section 5.3.
 *
 * Topology note: in the hub-and-spoke model this runs once per (path, account).
 * The hub is shared, so each account reconciles independently against it.
 */

export interface FileState {
  /** Whether the item exists in this snapshot. */
  exists: boolean;
  /** Content hash (md5). null when it doesn't exist or is a folder. */
  hash: string | null;
  /** "file" | "folder" — only meaningful when exists is true. */
  type?: "file" | "folder";
}

export const ABSENT: FileState = { exists: false, hash: null };

function sameState(a: FileState, b: FileState): boolean {
  if (a.exists !== b.exists) return false;
  if (!a.exists) return true; // both absent
  // Folders are compared by existence only (no content hash).
  if (a.type === "folder" || b.type === "folder") {
    return (a.type ?? "file") === (b.type ?? "file");
  }
  return a.hash === b.hash;
}

/**
 * Decide the action for one (local, base, remote) triple.
 *
 * Action meanings (from the LOCAL hub's perspective, applied to one account):
 *  - upload        push local -> this account's Drive
 *  - download      pull this account's Drive -> local hub
 *  - delete_remote remove on this account's Drive (move to trash)
 *  - delete_local  remove from local hub
 *  - mkdir_remote  create folder on Drive
 *  - mkdir_local   create folder locally
 *  - conflict      both sides changed incompatibly -> keep-both
 *  - noop          nothing to do (or only baseline needs updating)
 */
export function decide(
  local: FileState,
  base: FileState,
  remote: FileState,
): ReconcileAction {
  const localChanged = !sameState(local, base);
  const remoteChanged = !sameState(remote, base);

  // 1. Neither side moved since last sync.
  if (!localChanged && !remoteChanged) return "noop";

  // 2. Only local changed -> propagate local to remote.
  if (localChanged && !remoteChanged) {
    if (!local.exists) return "delete_remote";
    if (local.type === "folder") {
      return remote.exists ? "noop" : "mkdir_remote";
    }
    return "upload";
  }

  // 3. Only remote changed -> propagate remote to local.
  if (!localChanged && remoteChanged) {
    if (!remote.exists) return "delete_local";
    if (remote.type === "folder") {
      return local.exists ? "noop" : "mkdir_local";
    }
    return "download";
  }

  // 4. Both changed. Resolve.
  // 4a. Both converged to the same content (or both folders, or both deleted).
  if (sameState(local, remote)) return "noop";

  // 4b. Both deleted (already covered by sameState when both absent, but guard).
  if (!local.exists && !remote.exists) return "noop";

  // 4c. delete vs edit -> preserve the edit (revive the surviving side).
  if (local.exists && !remote.exists) {
    // local edited, remote deleted -> keep local, re-create remotely.
    return local.type === "folder" ? "mkdir_remote" : "upload";
  }
  if (!local.exists && remote.exists) {
    // local deleted, remote edited -> keep remote, re-create locally.
    return remote.type === "folder" ? "mkdir_local" : "download";
  }

  // 4d. Both exist with different content -> genuine conflict, keep both.
  return "conflict";
}

/**
 * Build the filename for a kept-both conflict copy of a remote version.
 * e.g. "report.xlsx" -> "report (conflict 2026-06-28 from a@b.com).xlsx".
 */
export function conflictCopyName(
  relPath: string,
  email: string,
  date: Date,
): string {
  const slash = relPath.lastIndexOf("/");
  const dir = slash >= 0 ? relPath.slice(0, slash + 1) : "";
  const base = slash >= 0 ? relPath.slice(slash + 1) : relPath;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const safeEmail = email.replace(/[\\/:*?"<>|]/g, "_");
  return `${dir}${stem} (conflict ${y}-${m}-${d} from ${safeEmail})${ext}`;
}
