import { useState } from "react";
import { Link } from "react-router-dom";
import { Repeat, Plus, HardDrive } from "lucide-react";
import { useJobs, useRemotes } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { JobCard } from "@/components/job-card";
import { JobDialog } from "@/components/job-dialog";

export function JobsPage() {
  const jobs = useJobs();
  const { data: remotes } = useRemotes();
  const [creating, setCreating] = useState(false);

  const hasRemotes = (remotes?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Source → destination transfers with a mode and schedule."
        actions={
          <Button
            variant="accent"
            disabled={!hasRemotes}
            onClick={() => setCreating(true)}
          >
            <Plus className="size-4" />
            Create job
          </Button>
        }
      />

      {jobs.isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : jobs.isError ? (
        <QueryError onRetry={() => jobs.refetch()} />
      ) : !hasRemotes ? (
        <EmptyState
          icon={HardDrive}
          title="Add a remote first"
          description="Jobs move data between remotes. Connect at least one storage remote to create a job."
          action={
            <Link to="/remotes">
              <Button variant="accent">
                <Plus className="size-4" />
                Add a remote
              </Button>
            </Link>
          }
        />
      ) : !jobs.data || jobs.data.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No jobs yet"
          description="Create your first job to start syncing or snapshotting data between remotes."
          action={
            <Button variant="accent" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Create job
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {jobs.data.map((job) => (
            <JobCard key={job.id} job={job} remotes={remotes ?? []} />
          ))}
        </div>
      )}

      <JobDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
