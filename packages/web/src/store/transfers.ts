import { create } from "zustand";

/** Kind of operation a transfer card represents. */
export type TransferKind = "upload" | "copy" | "move" | "delete";

/** Lifecycle of a transfer. */
export type TransferStatus = "active" | "done" | "error";

export interface Transfer {
  id: string;
  kind: TransferKind;
  /** Primary label — a filename, or a summary like "3 items". */
  title: string;
  status: TransferStatus;
  /**
   * 0..1 fraction for uploads (byte progress). `null` for copy/move/delete,
   * which have no byte progress and render an indeterminate bar.
   */
  progress: number | null;
  /** Live transfer rate in bytes/sec (uploads only). */
  speedBps?: number;
  /** Seconds remaining, derived from speed (uploads only). */
  etaSec?: number | null;
  /** Error message when `status === "error"`. */
  error?: string;
  /** Aborts the underlying XHR (uploads only); absent once finished. */
  abort?: () => void;
  /** Epoch ms the entry was created — newest sorts to the top. */
  createdAt: number;

  // --- Internal book-keeping for speed/ETA smoothing (uploads). ----------
  /** Bytes sent at the last progress sample. */
  _lastLoaded?: number;
  /** Timestamp (ms) of the last progress sample. */
  _lastTime?: number;
  /** Total bytes for the upload. */
  _total?: number;
}

interface TransfersState {
  transfers: Transfer[];
  /** Add a new transfer card and return its id. */
  add: (t: Omit<Transfer, "createdAt">) => string;
  /** Patch an existing transfer by id (no-op if it's gone). */
  update: (id: string, patch: Partial<Transfer>) => void;
  /**
   * Feed an upload progress sample; computes smoothed speed + ETA from the
   * delta since the previous sample and writes progress/speed/eta.
   */
  reportProgress: (id: string, loaded: number, total: number) => void;
  /** Mark finished; schedules auto-dismiss for successes (~4s). */
  finish: (id: string, status: "done" | "error", error?: string) => void;
  /** Remove a single transfer card. */
  remove: (id: string) => void;
  /** Remove all finished (done/error) cards. */
  clearFinished: () => void;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `tr_${Date.now().toString(36)}_${seq}`;
}

/**
 * Transfers store backing the bottom-right progress panel. Uploads push a card
 * and stream byte progress through `reportProgress`; awaited mutations
 * (copy/move/delete) push an indeterminate card and flip it via `finish`.
 * Successful cards auto-dismiss after a short delay; errors linger until the
 * user dismisses them.
 */
export const useTransfersStore = create<TransfersState>((set, get) => ({
  transfers: [],

  add: (t) => {
    const id = t.id || nextId();
    const entry: Transfer = { ...t, id, createdAt: Date.now() };
    set((s) => ({ transfers: [entry, ...s.transfers] }));
    return id;
  },

  update: (id, patch) =>
    set((s) => ({
      transfers: s.transfers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  reportProgress: (id, loaded, total) =>
    set((s) => ({
      transfers: s.transfers.map((t) => {
        if (t.id !== id) return t;
        const now = Date.now();
        let speedBps = t.speedBps;
        if (t._lastTime !== undefined && t._lastLoaded !== undefined) {
          const dt = (now - t._lastTime) / 1000;
          const db = loaded - t._lastLoaded;
          if (dt > 0 && db >= 0) {
            const instant = db / dt;
            // Exponential smoothing so the readout doesn't jitter.
            speedBps =
              speedBps === undefined
                ? instant
                : speedBps * 0.7 + instant * 0.3;
          }
        }
        const remaining = total - loaded;
        const etaSec =
          speedBps && speedBps > 0 ? Math.round(remaining / speedBps) : null;
        return {
          ...t,
          progress: total > 0 ? loaded / total : 0,
          speedBps,
          etaSec,
          _lastLoaded: loaded,
          _lastTime: now,
          _total: total,
        };
      }),
    })),

  finish: (id, status, error) => {
    set((s) => ({
      transfers: s.transfers.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              error,
              abort: undefined,
              progress: status === "done" ? 1 : t.progress,
              speedBps: undefined,
              etaSec: undefined,
            }
          : t,
      ),
    }));
    // Successes self-dismiss; errors stay until the user clears them.
    if (status === "done") {
      setTimeout(() => {
        // Only remove if it's still present and still done (not re-used).
        const cur = get().transfers.find((t) => t.id === id);
        if (cur && cur.status === "done") get().remove(id);
      }, 4000);
    }
  },

  remove: (id) =>
    set((s) => ({ transfers: s.transfers.filter((t) => t.id !== id) })),

  clearFinished: () =>
    set((s) => ({
      transfers: s.transfers.filter((t) => t.status === "active"),
    })),
}));
