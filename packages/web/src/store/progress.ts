import { create } from "zustand";
import type { JobProgress } from "@drivehub/types";

interface ProgressState {
  /** Live progress keyed by jobId. */
  byJob: Record<string, JobProgress>;
  set: (p: JobProgress) => void;
  clear: (jobId: string) => void;
}

/**
 * Holds live job progress pushed over SSE. Job cards subscribe to their own
 * entry so a running transfer shows a live bar without refetching.
 */
export const useProgressStore = create<ProgressState>((set) => ({
  byJob: {},
  set: (p) =>
    set((s) => {
      // When a run finishes/errors we keep the final frame briefly so the bar
      // can settle, but drop it once the job leaves the running state.
      if (p.status !== "running" && p.status !== "queued") {
        const next = { ...s.byJob };
        delete next[p.jobId];
        return { byJob: next };
      }
      return { byJob: { ...s.byJob, [p.jobId]: p } };
    }),
  clear: (jobId) =>
    set((s) => {
      const next = { ...s.byJob };
      delete next[jobId];
      return { byJob: next };
    }),
}));
