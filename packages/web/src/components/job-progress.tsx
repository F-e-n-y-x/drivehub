import { ArrowUp } from "lucide-react";
import { useProgressStore } from "@/store/progress";
import { ProgressBar } from "@/components/progress-bar";
import { formatBytes, formatSeconds, formatSpeed } from "@/lib/utils";

/**
 * Live transfer progress for a single job, sourced from the SSE-fed progress
 * store. Renders nothing when the job is not actively transferring.
 *
 * The headline line surfaces live throughput, percent (when the total is
 * known), ETA, and the file currently moving — e.g.
 * `↑ 12.3 MB/s · 45% · ETA 1m 20s · file.ext`. Snapshots that don't emit
 * granular progress simply fall back to transferred bytes + speed.
 */
export function JobProgress({ jobId }: { jobId: string }) {
  const p = useProgressStore((s) => s.byJob[jobId]);
  if (!p) return null;

  const hasTotal = p.totalBytes > 0;
  const frac = hasTotal ? p.bytes / p.totalBytes : 0;
  const pct = Math.min(100, Math.max(0, Math.round(frac * 100)));

  return (
    <div className="space-y-1.5">
      <ProgressBar value={frac} indeterminate={!hasTotal} />

      {/* Live throughput + ETA headline */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
        <span className="flex items-center gap-1 font-medium text-foreground">
          <ArrowUp className="size-3.5 text-accent" />
          {formatSpeed(p.speedBytesPerSec)}
        </span>
        <span className="text-muted-foreground/50">·</span>
        <span className="text-foreground">
          {hasTotal ? `${pct}%` : formatBytes(p.bytes)}
        </span>
        {p.etaSeconds != null && p.etaSeconds > 0 && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span>ETA {formatSeconds(p.etaSeconds)}</span>
          </>
        )}
        {p.currentFile && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="min-w-0 flex-1 truncate font-mono">
              {p.currentFile}
            </span>
          </>
        )}
      </div>

      {/* Transferred-of-total detail (only meaningful when total is known) */}
      {hasTotal && (
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {formatBytes(p.bytes)} / {formatBytes(p.totalBytes)}
        </p>
      )}
    </div>
  );
}
