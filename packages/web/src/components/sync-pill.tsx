import { Pause, Play, Loader2 } from "lucide-react";
import { useStatus, useEngineControl } from "@/hooks/queries";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SyncPill() {
  const { data: status, isLoading } = useStatus();
  const { pause, resume } = useEngineControl();

  if (isLoading || !status) {
    return <Skeleton className="h-8 w-32 rounded-lg" />;
  }

  const running = status.mode === "running";
  const busy = pause.isPending || resume.isPending;

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-0.5 pl-2.5">
      <div className="flex items-center gap-1.5">
        <StatusDot
          className={running ? "bg-synced" : "bg-paused"}
          pulse={running}
        />
        <span
          className={cn(
            "text-[13px] font-medium",
            running ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {running ? "Running" : "Paused"}
        </span>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={busy}
        onClick={() => (running ? pause.mutate() : resume.mutate())}
        aria-label={running ? "Pause sync" : "Resume sync"}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : running ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4" />
        )}
      </Button>
    </div>
  );
}
