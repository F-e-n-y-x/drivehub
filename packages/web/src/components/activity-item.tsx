import { formatDistanceToNow } from "date-fns";
import type { ActivityEvent } from "@drivehub/types";
import { activityLevelMeta } from "@/lib/status";
import { StatusDot } from "@/components/status-dot";
import { SimpleTooltip } from "@/components/ui/tooltip";

export function ActivityItem({ event }: { event: ActivityEvent }) {
  const meta = activityLevelMeta(event.level);
  const when = formatDistanceToNow(new Date(event.at), { addSuffix: true });

  return (
    <div className="flex gap-3 py-2.5">
      <div className="mt-1.5">
        <StatusDot className={meta.dotClass} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">{event.message}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {event.relPath && (
            <span className="truncate font-mono text-[11px] text-muted-foreground/90">
              {event.relPath}
            </span>
          )}
          {event.accountEmail && (
            <>
              {event.relPath && <span className="opacity-40">·</span>}
              <span className="truncate">{event.accountEmail}</span>
            </>
          )}
        </div>
      </div>
      <SimpleTooltip label={new Date(event.at).toLocaleString()}>
        <time className="shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {when}
        </time>
      </SimpleTooltip>
    </div>
  );
}
