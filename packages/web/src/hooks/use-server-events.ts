import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ActivityEvent,
  ConflictRecord,
  EngineStatus,
  ServerEvent,
} from "@drivehub/types";
import { qk } from "@/lib/api";

export type ConnectionState = "connecting" | "open" | "closed";

/**
 * Subscribes to the backend SSE stream and reconciles incoming events into the
 * TanStack Query cache so the whole UI stays live without manual refetches.
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
        case "stats": {
          const stats = event.payload;
          queryClient.setQueryData<EngineStatus>(qk.status, (prev) =>
            prev ? { ...prev, stats } : prev,
          );
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
          // Bump lastActivityAt on stats.
          queryClient.setQueryData<EngineStatus>(qk.status, (prev) =>
            prev
              ? {
                  ...prev,
                  stats: { ...prev.stats, lastActivityAt: ev.at },
                }
              : prev,
          );
          break;
        }
        case "account": {
          const account = event.payload;
          queryClient.setQueryData<EngineStatus>(qk.status, (prev) =>
            prev
              ? {
                  ...prev,
                  accounts: prev.accounts.map((a) =>
                    a.id === account.id ? account : a,
                  ),
                }
              : prev,
          );
          queryClient.invalidateQueries({ queryKey: qk.accounts });
          break;
        }
        case "conflict": {
          const conflict: ConflictRecord = event.payload;
          queryClient.setQueryData<ConflictRecord[]>(qk.conflicts, (prev) => {
            if (!prev) return [conflict];
            const idx = prev.findIndex((c) => c.id === conflict.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = conflict;
              return next;
            }
            return [conflict, ...prev];
          });
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
