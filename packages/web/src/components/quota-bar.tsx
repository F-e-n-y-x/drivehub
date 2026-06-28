import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";

export function QuotaBar({
  used,
  total,
}: {
  used: number | null;
  total: number | null;
}) {
  const hasData = used !== null && total !== null && total > 0;
  const pct = hasData ? Math.min(100, (used / total) * 100) : 0;
  const tone =
    pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-pending" : "bg-accent";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>{hasData ? `${formatBytes(used)} used` : "Storage unknown"}</span>
        {hasData && <span>{formatBytes(total)}</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", tone)}
          style={{ width: `${hasData ? Math.max(2, pct) : 0}%` }}
        />
      </div>
    </div>
  );
}
