import { Link } from "react-router-dom";
import {
  HardDrive,
  Repeat,
  Activity as ActivityIcon,
  CheckCircle2,
  Database,
  Plus,
  ScrollText,
  History,
} from "lucide-react";
import {
  useStatus,
  useJobs,
  useRemotes,
  useActivity,
  useRuns,
} from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { StatCard } from "@/components/stat-card";
import { EngineHero } from "@/components/engine-hero";
import { JobCard } from "@/components/job-card";
import { ActivityItem } from "@/components/activity-item";
import { RunsTable } from "@/components/runs-table";
import { formatBytes } from "@/lib/utils";

export function DashboardPage() {
  const status = useStatus();
  const jobs = useJobs();
  const remotes = useRemotes();
  const activity = useActivity("");
  const runs = useRuns();

  if (status.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <QueryError onRetry={() => status.refetch()} />
      </div>
    );
  }

  const stats = status.data?.stats;
  const noRemotes = !remotes.isLoading && (remotes.data?.length ?? 0) === 0;
  const jobName = (id: string) =>
    jobs.data?.find((j) => j.id === id)?.name ?? "Job";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your backup engine at a glance."
      />

      {status.isLoading || !status.data ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : (
        <EngineHero status={status.data} />
      )}

      {noRemotes ? (
        <EmptyState
          icon={HardDrive}
          title="Add your first storage remote"
          description="DriveHub backs up and syncs between storage remotes. Connect one to get started — local disk, S3, Google Drive, Dropbox and more."
          action={
            <Link to="/remotes">
              <Button variant="accent">
                <Plus className="size-4" />
                Add a remote
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              label="Remotes"
              value={String(stats?.remotes ?? 0)}
              icon={HardDrive}
              loading={status.isLoading}
            />
            <StatCard
              label="Jobs"
              value={String(stats?.jobs ?? 0)}
              sub={`${stats?.jobsEnabled ?? 0} enabled`}
              icon={Repeat}
              loading={status.isLoading}
            />
            <StatCard
              label="Enabled"
              value={String(stats?.jobsEnabled ?? 0)}
              icon={CheckCircle2}
              tone="accent"
              loading={status.isLoading}
            />
            <StatCard
              label="Running"
              value={String(stats?.runningJobs ?? 0)}
              icon={ActivityIcon}
              tone={stats?.runningJobs ? "pending" : "default"}
              loading={status.isLoading}
            />
            <StatCard
              label="Session transfer"
              value={formatBytes(stats?.bytesTransferredSession ?? 0)}
              icon={Database}
              loading={status.isLoading}
            />
          </div>

          {/* Jobs */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Jobs</h2>
              <Link
                to="/jobs"
                className="text-xs font-medium text-accent hover:underline"
              >
                Manage jobs
              </Link>
            </div>
            {jobs.isLoading ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Skeleton className="h-48 rounded-xl" />
                <Skeleton className="h-48 rounded-xl" />
              </div>
            ) : !jobs.data || jobs.data.length === 0 ? (
              <EmptyState
                icon={Repeat}
                title="No jobs yet"
                description="Create a job to start syncing between your remotes."
                action={
                  <Link to="/jobs">
                    <Button variant="accent">
                      <Plus className="size-4" />
                      Create job
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {jobs.data.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    remotes={remotes.data ?? []}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Activity + recent runs */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent activity</CardTitle>
                <Link
                  to="/activity"
                  className="text-xs font-medium text-accent hover:underline"
                >
                  View all
                </Link>
              </CardHeader>
              <div className="px-5 pb-2">
                {activity.isLoading ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : !activity.data || activity.data.length === 0 ? (
                  <EmptyState
                    icon={ScrollText}
                    title="No activity yet"
                    description="Actions will appear here as jobs run."
                    className="border-0 bg-transparent py-8"
                  />
                ) : (
                  <div className="divide-y divide-border/60">
                    {activity.data.slice(0, 8).map((e) => (
                      <ActivityItem key={e.id} event={e} />
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent runs</CardTitle>
              </CardHeader>
              <div className="px-2 pb-3">
                {runs.isLoading ? (
                  <div className="space-y-2 px-3 py-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : !runs.data || runs.data.length === 0 ? (
                  <EmptyState
                    icon={History}
                    title="No runs yet"
                    description="Run a job to see results here."
                    className="border-0 bg-transparent py-8"
                  />
                ) : (
                  <RunsTable runs={runs.data.slice(0, 8)} jobName={jobName} />
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
