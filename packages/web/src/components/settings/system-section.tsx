import { RefreshCw } from "lucide-react";
import type { SystemInfo } from "@drivehub/types";
import { useSystem } from "@/hooks/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/status-dot";
import { QueryError } from "@/components/query-error";
import { formatBytes, cn } from "@/lib/utils";

/** Humanize a duration given in seconds, e.g. 273120 -> "3d 4h 12m". */
function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  if (!d && !h && !m) parts.push(`${s % 60}s`);
  return parts.join(" ");
}

function DefRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3 py-1.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}

function SystemDetails({ data }: { data: SystemInfo }) {
  return (
    <dl className="divide-y divide-border/60">
      <DefRow label="DriveHub version">
        <Mono>{data.appVersion}</Mono>
      </DefRow>
      <DefRow label="rclone version">
        <span className="inline-flex items-center gap-2">
          <Mono>{data.rcloneVersion ?? "not found"}</Mono>
          {!data.rcloneAvailable && (
            <Badge className="border-transparent bg-rose-500/10 text-rose-500">
              not found
            </Badge>
          )}
        </span>
      </DefRow>
      <DefRow label="Docker socket">
        <span className="inline-flex items-center gap-2">
          <StatusDot
            className={data.dockerAvailable ? "bg-emerald-500" : "bg-zinc-400"}
          />
          {data.dockerAvailable ? "connected" : "not mounted"}
        </span>
      </DefRow>
      <DefRow label="Node">
        <Mono>{data.node}</Mono>
      </DefRow>
      <DefRow label="Platform">
        {data.platform}/{data.arch}
      </DefRow>
      <DefRow label="Host">{data.hostname}</DefRow>
      <DefRow label="CPUs">{data.cpus}</DefRow>
      <DefRow label="Memory">{formatBytes(data.totalMemBytes)}</DefRow>
      <DefRow label="Data dir">
        <Mono>{data.dataDir}</Mono>
      </DefRow>
      <DefRow label="Hub path">
        <Mono>{data.hubPath}</Mono>
      </DefRow>
      <DefRow label="Uptime">{formatUptime(data.uptimeSeconds)}</DefRow>
    </dl>
  );
}

export function SystemSection() {
  const { data, isLoading, isError, isFetching, refetch } = useSystem();

  return (
    <section id="system" className="scroll-mt-24">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            System
          </h2>
          <p className="text-sm text-muted-foreground">
            Runtime environment and diagnostics for this instance.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>
      <div className="pt-5">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[140px_1fr] items-center gap-3 py-1.5"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        ) : (
          <SystemDetails data={data} />
        )}
      </div>
    </section>
  );
}
