import { History } from "lucide-react";
import type { JobPublic } from "@drivehub/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { RunsTable } from "@/components/runs-table";
import { useJobRuns } from "@/hooks/queries";

export function RunHistoryDialog({
  open,
  onOpenChange,
  job,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobPublic;
}) {
  const { data, isLoading, isError, refetch } = useJobRuns(open ? job.id : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Run history — {job.name}</DialogTitle>
          <DialogDescription>
            Every recorded run for this job, newest first.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : !data || data.length === 0 ? (
            <EmptyState
              icon={History}
              title="No runs yet"
              description="Run this job to see its history here."
              className="border-0 bg-transparent"
            />
          ) : (
            <RunsTable runs={data} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
