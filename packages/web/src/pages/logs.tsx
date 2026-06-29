import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eraser, Pause, Play, X } from "lucide-react";
import type { LogEntry, LogLevel } from "@drivehub/types";
import { api, logsDownloadUrl } from "@/lib/api";
import { useLogLevel, useSetLogLevel } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Keep the in-memory tail bounded so a long-running session can't grow without
// limit. Older lines fall off the top.
const MAX_LINES = 2000;
const BACKLOG_LIMIT = 500;

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

/** Numeric rank used for the "minimum level" client filter. */
const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/** Dot + text color per level, tuned to the design tokens. */
const LEVEL_STYLES: Record<LogLevel, { dot: string; text: string }> = {
  trace: { dot: "bg-zinc-400", text: "text-zinc-400" },
  debug: { dot: "bg-zinc-400", text: "text-zinc-400" },
  info: { dot: "bg-sky-500", text: "text-sky-500" },
  warn: { dot: "bg-amber-500", text: "text-amber-500" },
  error: { dot: "bg-rose-500", text: "text-rose-500" },
  fatal: { dot: "bg-rose-500", text: "text-rose-500" },
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const mmm = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}

export function LogsPage() {
  const { data: levelData } = useLogLevel();
  const setLevel = useSetLogLevel();

  const [lines, setLines] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [minLevel, setMinLevel] = useState<LogLevel | "all">("all");

  // Live-tail plumbing.
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Largest id we've appended, so reconnects don't re-add backlog entries.
  const lastIdRef = useRef<number>(-1);

  const append = (entry: LogEntry) => {
    if (pausedRef.current) return;
    if (entry.id <= lastIdRef.current) return;
    lastIdRef.current = entry.id;
    setLines((prev) => {
      const next =
        prev.length >= MAX_LINES
          ? prev.slice(prev.length - MAX_LINES + 1)
          : prev.slice();
      next.push(entry);
      return next;
    });
  };

  // Load the backlog, then open the SSE live tail. The EventSource lives for
  // the component's lifetime and auto-reconnects; we de-dupe by id.
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    (async () => {
      try {
        const backlog = await api.getLogs(BACKLOG_LIMIT);
        if (cancelled) return;
        setLines(backlog);
        lastIdRef.current = backlog.length
          ? backlog[backlog.length - 1]!.id
          : -1;
      } catch {
        // A failed backlog load still lets the live tail populate.
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (cancelled) return;
      es = new EventSource("/api/logs/stream");
      es.onmessage = (ev) => {
        try {
          const entry = JSON.parse(ev.data) as LogEntry;
          append(entry);
        } catch {
          /* ignore malformed frames */
        }
      };
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track whether the viewport is pinned to the bottom so we only auto-scroll
  // when the user hasn't scrolled up to read history.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const min = minLevel === "all" ? -1 : LEVEL_RANK[minLevel];
    return lines.filter((l) => {
      if (min >= 0 && LEVEL_RANK[l.level] < min) return false;
      if (!q) return true;
      const hay = `${l.msg} ${l.context ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [lines, filter, minLevel]);

  // Auto-scroll the inner box to the bottom after new lines render, but only if
  // we were already pinned there. Never grows or scrolls the page itself.
  useEffect(() => {
    if (atBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const currentLevel = levelData?.level ?? "info";

  return (
    <div className="flex h-full min-h-[32rem] w-full flex-col gap-6">
      <PageHeader
        title="Logs"
        description="Live application log, streamed from the server in real time."
      />

      <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
        {/* Controls */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Runtime level
            </span>
            <div className="w-32">
              <SimpleSelect
                value={currentLevel}
                onValueChange={(v) => setLevel.mutate(v as LogLevel)}
                disabled={setLevel.isPending}
                aria-label="Runtime log level"
                options={LEVELS.map((l) => ({ value: l, label: l }))}
              />
            </div>
          </div>

          <div className="relative flex-1">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter messages…"
              aria-label="Filter logs"
              className="pr-8"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear filter"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Min level
            </span>
            <div className="w-28">
              <SimpleSelect
                value={minLevel}
                onValueChange={(v) => setMinLevel(v as LogLevel | "all")}
                aria-label="Minimum level filter"
                options={[
                  { value: "all", label: "All" },
                  ...LEVELS.map((l) => ({ value: l, label: l })),
                ]}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={paused ? "accent" : "outline"}
              size="sm"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? (
                <>
                  <Play className="size-4" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="size-4" />
                  Pause
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLines([]);
                atBottomRef.current = true;
              }}
            >
              <Eraser className="size-4" />
              Clear
            </Button>
            <a
              href={logsDownloadUrl()}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download className="size-4" />
              Download
            </a>
          </div>
        </div>

        {/* Terminal viewer — fills remaining height, scrolls internally. */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-zinc-950 p-3 font-mono text-xs leading-relaxed"
        >
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 16 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-3.5 rounded bg-zinc-800"
                  style={{ width: `${45 + ((i * 17) % 50)}%` }}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-zinc-500">
              {lines.length === 0
                ? "No log entries yet. New activity will appear here live."
                : "No entries match the current filters."}
            </div>
          ) : (
            <ol className="space-y-0.5">
              {filtered.map((l) => {
                const s = LEVEL_STYLES[l.level];
                return (
                  <li
                    key={l.id}
                    className="flex items-baseline gap-2 break-words"
                  >
                    <span className="shrink-0 tabular-nums text-zinc-500">
                      {formatTime(l.time)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 uppercase",
                        s.text,
                      )}
                    >
                      <span
                        className={cn("size-1.5 rounded-full", s.dot)}
                        aria-hidden
                      />
                      {l.level}
                    </span>
                    <span className="min-w-0 text-zinc-100">{l.msg}</span>
                    {l.context && (
                      <span className="min-w-0 text-zinc-500">{l.context}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <p className="shrink-0 text-xs text-muted-foreground">
          Showing {filtered.length} of {lines.length} buffered line
          {lines.length === 1 ? "" : "s"}
          {paused && " · live tail paused"}.
        </p>
      </div>
    </div>
  );
}
