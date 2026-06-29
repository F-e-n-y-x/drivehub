import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Camera,
  History,
  Loader2,
  Pencil,
  Play,
  Repeat,
  Trash2,
} from "lucide-react";
import type { JobPublic, RemotePublic } from "@drivehub/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { StatusDot } from "@/components/status-dot";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { JobProgress } from "@/components/job-progress";
import { JobDialog } from "@/components/job-dialog";
import { RunHistoryDialog } from "@/components/run-history-dialog";
import { jobStatusMeta } from "@/lib/status";
import { modeLabel, scheduleSummary } from "@/lib/remotes";
import { useJobMutations } from "@/hooks/queries";
import { useProgressStore } from "@/store/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

function endpoint(remotes: RemotePublic[], id: string, path: string): string {
  const label = remotes.find((r) => r.id === id)?.label ?? "?";
  return path ? `${label}:${path}` : label;
}

export function JobCard({
  job,
  remotes,
}: {
  job: JobPublic;
  remotes: RemotePublic[];
}) {
  const { run, remove, update } = useJobMutations();
  const live = useProgressStore((s) => s.byJob[job.id]);
  const running = job.lastStatus === "running" || !!live;
  const status = jobStatusMeta(running ? "running" : job.lastStatus);

  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const TypeIcon = job.type === "snapshot" ? Camera : Repeat;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent">
          <TypeIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {job.name}
            </h3>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate font-mono">
              {endpoint(remotes, job.sourceRemoteId, job.sourcePath)}
            </span>
            <ArrowRight className="size-3 shrink-0" />
            <span className="truncate font-mono">
              {endpoint(remotes, job.destRemoteId, job.destPath)}
            </span>
          </div>
        </div>
        <Badge variant={status.badgeVariant}>
          <StatusDot className={status.dotClass} pulse={running} />
          {status.label}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{job.type === "snapshot" ? "Snapshot" : "Sync"}</Badge>
        {job.type === "sync" && (
          <Badge variant="default">{modeLabel(job.mode)}</Badge>
        )}
        <Badge variant="default">{scheduleSummary(job.schedule)}</Badge>
        {job.lastRunAt && (
          <span className="text-xs text-muted-foreground">
            Last run {formatDistanceToNow(job.lastRunAt, { addSuffix: true })}
          </span>
        )}
      </div>

      {job.lastError && !running && (
        <p className="rounded-lg bg-danger/[0.06] px-3 py-2 text-xs text-danger">
          {job.lastError}
        </p>
      )}

      {running && <JobProgress jobId={job.id} />}

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <SimpleTooltip label={job.enabled ? "Enabled" : "Disabled"}>
          <span>
            <Switch
              checked={job.enabled}
              onCheckedChange={(enabled) =>
                update.mutate({
                  id: job.id,
                  body: {
                    name: job.name,
                    type: job.type,
                    sourceRemoteId: job.sourceRemoteId,
                    sourcePath: job.sourcePath,
                    destRemoteId: job.destRemoteId,
                    destPath: job.destPath,
                    mode: job.mode,
                    schedule: job.schedule,
                    enabled,
                    snapshot: job.snapshot,
                    quiesceContainers: job.quiesceContainers,
                  },
                })
              }
            />
          </span>
        </SimpleTooltip>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          disabled={run.isPending || running}
          onClick={() => run.mutate(job.id)}
        >
          {run.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Run now
        </Button>
        <SimpleTooltip label="Run history">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setHistory(true)}
            aria-label="Run history"
          >
            <History className="size-4" />
          </Button>
        </SimpleTooltip>
        <SimpleTooltip label="Edit">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(true)}
            aria-label="Edit job"
          >
            <Pencil className="size-4" />
          </Button>
        </SimpleTooltip>
        <SimpleTooltip label="Delete">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete job"
          >
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </SimpleTooltip>
      </div>

      {editing && (
        <JobDialog open={editing} onOpenChange={setEditing} job={job} />
      )}
      {history && (
        <RunHistoryDialog
          open={history}
          onOpenChange={setHistory}
          job={job}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{job.name}"?</DialogTitle>
            <DialogDescription>
              This permanently removes the job and its schedule. Already-synced
              data is not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(job.id, {
                  onSuccess: () => setConfirmDelete(false),
                })
              }
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
