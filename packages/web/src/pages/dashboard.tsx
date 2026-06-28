import { Link } from "react-router-dom";
import {
  Boxes,
  Clock,
  GitMerge,
  TriangleAlert,
  ArrowUp,
  ArrowDown,
  Activity as ActivityIcon,
  FolderSync,
  Pause,
  Play,
} from "lucide-react";
import { useStatus, useActivity, useEngineControl } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AccountCard } from "@/components/account-card";
import { ActivityItem } from "@/components/activity-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { StatusDot } from "@/components/status-dot";
import { formatBytes, formatNumber } from "@/lib/utils";

function HeroStatus() {
  const { data: status, isLoading } = useStatus();
  const { pause, resume } = useEngineControl();

  if (isLoading || !status) {
    return <Skeleton className="h-[104px] w-full rounded-xl" />;
  }

  const running = status.mode === "running";
  const busy = pause.isPending || resume.isPending;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent-muted text-accent">
            <FolderSync className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <StatusDot
                className={running ? "bg-synced" : "bg-paused"}
                pulse={running}
              />
              <span className="text-sm font-semibold text-foreground">
                Engine {running ? "running" : "paused"}
              </span>
              <span className="text-xs text-muted-foreground capitalize">
                · {status.mode}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
              {status.hubPath}
            </p>
          </div>
        </div>
        <Button
          variant={running ? "outline" : "accent"}
          disabled={busy}
          onClick={() => (running ? pause.mutate() : resume.mutate())}
        >
          {running ? (
            <>
              <Pause className="size-4" /> Pause sync
            </>
          ) : (
            <>
              <Play className="size-4" /> Resume sync
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function StatGrid() {
  const { data: status, isLoading } = useStatus();
  const s = status?.stats;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Tracked"
        value={formatNumber(s?.itemsTracked)}
        icon={Boxes}
        tone="accent"
        loading={isLoading}
      />
      <StatCard
        label="Pending"
        value={formatNumber(s?.pendingOps)}
        icon={Clock}
        tone={s && s.pendingOps > 0 ? "pending" : "default"}
        loading={isLoading}
      />
      <StatCard
        label="Conflicts"
        value={formatNumber(s?.conflicts)}
        icon={GitMerge}
        tone={s && s.conflicts > 0 ? "conflict" : "default"}
        loading={isLoading}
      />
      <StatCard
        label="Errors"
        value={formatNumber(s?.errors)}
        icon={TriangleAlert}
        tone={s && s.errors > 0 ? "error" : "default"}
        loading={isLoading}
      />
      <StatCard
        label="Uploaded"
        value={formatBytes(s?.uploadedBytesSession)}
        sub="this session"
        icon={ArrowUp}
        loading={isLoading}
      />
      <StatCard
        label="Downloaded"
        value={formatBytes(s?.downloadedBytesSession)}
        sub="this session"
        icon={ArrowDown}
        loading={isLoading}
      />
    </div>
  );
}

function AccountHealth() {
  const { data: status, isLoading, isError, refetch } = useStatus();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Account health
        </h2>
        <Link
          to="/accounts"
          className="text-xs font-medium text-accent hover:underline underline-offset-4"
        >
          Manage accounts
        </Link>
      </div>
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : status && status.accounts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {status.accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderSync}
          title="No accounts connected"
          description="Connect a Google account to start syncing."
          action={
            <Button variant="accent" onClick={() => (window.location.href = "/api/auth/google/start")}>
              Connect Google Account
            </Button>
          }
        />
      )}
    </section>
  );
}

function LiveActivity() {
  const { data: events, isLoading, isError, refetch } = useActivity("");
  const latest = events?.slice(0, 15) ?? [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-muted-foreground" />
          Live activity
        </CardTitle>
        <Link
          to="/activity"
          className="text-xs font-medium text-accent hover:underline underline-offset-4"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="mt-1 size-2 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : latest.length === 0 ? (
          <EmptyState
            icon={ActivityIcon}
            title="No activity yet"
            description="Sync events will appear here in real time."
            className="border-0 bg-transparent py-10"
          />
        ) : (
          <div className="divide-y divide-border/60">
            {latest.map((e) => (
              <ActivityItem key={e.id} event={e} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        title="Dashboard"
        description="Real-time overview of your sync engine and connected accounts."
      />
      <HeroStatus />
      <StatGrid />
      <div className="grid gap-7 lg:grid-cols-[1.4fr_1fr]">
        <AccountHealth />
        <LiveActivity />
      </div>
    </div>
  );
}
