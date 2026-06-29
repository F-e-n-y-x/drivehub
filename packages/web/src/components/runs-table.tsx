import { formatDistanceToNow } from "date-fns";
import type { JobRun } from "@drivehub/types";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/status-dot";
import { jobStatusMeta } from "@/lib/status";
import { formatBytes, formatDuration, formatNumber } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";

export function RunsTable({
  runs,
  jobName,
}: {
  runs: JobRun[];
  /** Optional resolver for a run's job name (omit when scoped to one job). */
  jobName?: (jobId: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
            {jobName && <th className="px-3 py-2">Job</th>}
            <th className="px-3 py-2">Started</th>
            <th className="px-3 py-2">Duration</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Files</th>
            <th className="px-3 py-2 text-right">Bytes</th>
            <th className="px-3 py-2">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {runs.map((run) => {
            const meta = jobStatusMeta(run.status);
            return (
              <tr key={run.id} className="text-foreground">
                {jobName && (
                  <td className="px-3 py-2.5 font-medium">
                    {jobName(run.jobId)}
                  </td>
                )}
                <td className="px-3 py-2.5 text-muted-foreground">
                  <SimpleTooltip label={new Date(run.startedAt).toLocaleString()}>
                    <span>
                      {formatDistanceToNow(run.startedAt, { addSuffix: true })}
                    </span>
                  </SimpleTooltip>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatDuration(run.startedAt, run.finishedAt)}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={meta.badgeVariant}>
                    <StatusDot
                      className={meta.dotClass}
                      pulse={run.status === "running"}
                    />
                    {meta.label}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatNumber(run.filesTransferred)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatBytes(run.bytesTransferred)}
                </td>
                <td className="max-w-[18rem] truncate px-3 py-2.5 text-muted-foreground">
                  {run.message ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
