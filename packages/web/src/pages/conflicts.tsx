import { formatDistanceToNow } from "date-fns";
import { Check, GitMerge, CircleCheck, Loader2 } from "lucide-react";
import type { ConflictRecord } from "@drivehub/types";
import { useConflicts, useResolveConflict } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { SimpleTooltip } from "@/components/ui/tooltip";

function ConflictRow({ conflict }: { conflict: ConflictRecord }) {
  const resolve = useResolveConflict();
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-conflict/10 text-conflict">
          <GitMerge className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium text-foreground">
            {conflict.relPath}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Conflict copy:{" "}
            <span className="font-mono">{conflict.conflictCopyPath}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="truncate">{conflict.accountEmail}</span>
            <span className="opacity-40">·</span>
            <SimpleTooltip
              label={new Date(conflict.detectedAt).toLocaleString()}
            >
              <span>
                detected{" "}
                {formatDistanceToNow(new Date(conflict.detectedAt), {
                  addSuffix: true,
                })}
              </span>
            </SimpleTooltip>
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-start sm:self-center"
        disabled={resolve.isPending}
        onClick={() => resolve.mutate(conflict.id)}
      >
        {resolve.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        Mark resolved
      </Button>
    </div>
  );
}

export function ConflictsPage() {
  const { data, isLoading, isError, refetch } = useConflicts();
  const unresolved = data?.filter((c) => !c.resolved) ?? [];

  return (
    <div className="space-y-7">
      <PageHeader
        title="Conflicts"
        description="Files that changed on both sides and need a manual decision."
      />

      {isLoading ? (
        <Card className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          ))}
        </Card>
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : unresolved.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="No conflicts — everything's in sync"
          description="When the same file changes in two places at once, it'll show up here for you to resolve."
        />
      ) : (
        <Card className="divide-y divide-border">
          {unresolved.map((c) => (
            <ConflictRow key={c.id} conflict={c} />
          ))}
        </Card>
      )}
    </div>
  );
}
