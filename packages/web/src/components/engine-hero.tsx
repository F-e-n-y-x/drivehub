import { AlertTriangle, Box, Pause, Play, Loader2, Terminal } from "lucide-react";
import type { EngineStatus } from "@drivehub/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/status-dot";
import { useEngineControl } from "@/hooks/queries";

export function EngineHero({ status }: { status: EngineStatus }) {
  const { pause, resume } = useEngineControl();
  const running = status.mode === "running";
  const busy = pause.isPending || resume.isPending;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent-muted text-accent">
            <StatusDot
              className={running ? "bg-synced" : "bg-paused"}
              pulse={running}
            />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Engine
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {running ? "Running" : "Paused"}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={status.rcloneAvailable ? "synced" : "error"}>
                <Terminal className="size-3" />
                rclone {status.rcloneVersion ?? "—"}
              </Badge>
              {status.dockerAvailable && (
                <Badge variant="default">
                  <Box className="size-3" />
                  Docker
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Button
          variant={running ? "outline" : "accent"}
          disabled={busy}
          onClick={() => (running ? pause.mutate() : resume.mutate())}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : running ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
          {running ? "Pause engine" : "Resume engine"}
        </Button>
      </div>

      {!status.rcloneAvailable && (
        <div className="flex items-start gap-3 border-t border-danger/20 bg-danger/[0.05] px-6 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            rclone is not available on the server. Jobs cannot run until it is
            installed and on the PATH. See SETUP.md.
          </p>
        </div>
      )}
    </Card>
  );
}
