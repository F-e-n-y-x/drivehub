import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ActivityEvent,
  EngineStatus,
  JobPublic,
  ServerEvent,
  UpdateStatus,
} from "@drivehub/types";
import { qk } from "@/lib/api";
import { useProgressStore } from "@/store/progress";

export type ConnectionState = "connecting" | "open" | "closed";

/**
 * Subscribes to the backend SSE stream and reconciles incoming events into the
 * TanStack Query cache (and the live progress store) so the whole UI stays
 * live without manual refetches.
 */
export function useServerEvents(): ConnectionState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>("connecting");
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    sourceRef.current = es;

    es.onopen = () => setState("open");
    es.onerror = () => setState("closed"); // EventSource auto-reconnects

    es.onmessage = (msg) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(msg.data) as ServerEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case "status": {
          queryClient.setQueryData<EngineStatus>(qk.status, event.payload);
          break;
        }
        case "activity": {
          const ev = event.payload;
          // Prepend to every cached activity query (across search variants).
          queryClient
            .getQueryCache()
            .findAll({ queryKey: ["activity"] })
            .forEach((q) => {
              queryClient.setQueryData<ActivityEvent[]>(q.queryKey, (prev) =>
                prev ? [ev, ...prev].slice(0, 200) : [ev],
              );
            });
          break;
        }
        case "remote": {
          queryClient.invalidateQueries({ queryKey: qk.remotes });
          break;
        }
        case "job": {
          const job = event.payload;
          queryClient.setQueryData<JobPublic[]>(qk.jobs, (prev) => {
            if (!prev) return [job];
            const idx = prev.findIndex((j) => j.id === job.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = job;
              return next;
            }
            return [...prev, job];
          });
          break;
        }
        case "run": {
          const run = event.payload;
          queryClient.invalidateQueries({ queryKey: qk.runs });
          queryClient.invalidateQueries({ queryKey: qk.jobRuns(run.jobId) });
          break;
        }
        case "progress": {
          useProgressStore.getState().set(event.payload);
          break;
        }
        case "updates": {
          queryClient.setQueryData<UpdateStatus>(qk.updates, event.payload);
          break;
        }
      }
    };

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [queryClient]);

  return state;
}
