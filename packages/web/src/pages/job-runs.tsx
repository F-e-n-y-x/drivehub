import { Link, useParams } from "react-router-dom";
import { ArrowLeft, History } from "lucide-react";
import { useJobRuns, useJobs } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { RunsTable } from "@/components/runs-table";

export function JobRunsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: jobs } = useJobs();
  const { data, isLoading, isError, refetch } = useJobRuns(id ?? null);
  const job = jobs?.find((j) => j.id === id);

  return (
    <div className="space-y-6">
      <Link
        to="/jobs"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to jobs
      </Link>

      <PageHeader
        title={job ? `Runs — ${job.name}` : "Run history"}
        description="Every recorded run for this job, newest first."
      />

      {isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={History}
          title="No runs yet"
          description="Run this job to see its history here."
        />
      ) : (
        <Card className="p-2">
          <RunsTable runs={data} />
        </Card>
      )}
    </div>
  );
}
