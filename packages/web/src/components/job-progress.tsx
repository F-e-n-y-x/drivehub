import { useProgressStore } from "@/store/progress";
import { ProgressBar } from "@/components/progress-bar";
import { formatBytes, formatSpeed } from "@/lib/utils";

/**
 * Live transfer progress for a single job, sourced from the SSE-fed progress
 * store. Renders nothing when the job is not actively transferring.
 */
export function JobProgress({ jobId }: { jobId: string }) {
  const p = useProgressStore((s) => s.byJob[jobId]);
  if (!p) return null;

  const hasTotal = p.totalBytes > 0;
  const frac = hasTotal ? p.bytes / p.totalBytes : 0;

  return (
    <div className="space-y-1.5">
      <ProgressBar value={frac} indeterminate={!hasTotal} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        <span className="truncate font-mono">
          {p.currentFile ?? "Preparing…"}
        </span>
        <span className="shrink-0">
          {formatBytes(p.bytes)}
          {hasTotal && ` / ${formatBytes(p.totalBytes)}`} ·{" "}
          {formatSpeed(p.speedBytesPerSec)}
        </span>
      </div>
    </div>
  );
}
