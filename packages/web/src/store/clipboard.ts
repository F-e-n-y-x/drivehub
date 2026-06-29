import { create } from "zustand";

export type ClipboardOp = "copy" | "cut";

export interface ClipboardEntry {
  path: string;
  name: string;
  isDir: boolean;
}

interface ClipboardState {
  op: ClipboardOp | null;
  /** Source remote the entries were copied/cut from (paste is cross-remote). */
  remoteId: string | null;
  entries: ClipboardEntry[];
  set: (op: ClipboardOp, remoteId: string, entries: ClipboardEntry[]) => void;
  clear: () => void;
}

/**
 * File-explorer clipboard. Holds the source remote + entries for a copy or cut.
 * Paste reads this to build `/api/transfer-op` calls into the current folder;
 * after a successful cut+paste the page clears it, after copy it stays.
 */
export const useClipboardStore = create<ClipboardState>((set) => ({
  op: null,
  remoteId: null,
  entries: [],
  set: (op, remoteId, entries) => set({ op, remoteId, entries }),
  clear: () => set({ op: null, remoteId: null, entries: [] }),
}));
