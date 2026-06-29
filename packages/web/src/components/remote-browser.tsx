import { useState } from "react";
import {
  ChevronRight,
  Folder,
  File as FileIcon,
  Home,
  Loader2,
} from "lucide-react";
import { useBrowse } from "@/hooks/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-error";
import { EmptyState } from "@/components/empty-state";
import { cn, formatBytes } from "@/lib/utils";

/**
 * Folder browser for a single remote. Drives both the Browser page and the
 * path picker inside the job dialog. `onPathChange` reports the current folder
 * so callers can use it as a selected path.
 */
export function RemoteBrowser({
  remoteId,
  initialPath = "",
  onPathChange,
  className,
}: {
  remoteId: string;
  initialPath?: string;
  onPathChange?: (path: string) => void;
  className?: string;
}) {
  const [path, setPath] = useState(initialPath);
  const { data, isLoading, isError, refetch, isFetching } = useBrowse(
    remoteId,
    path,
  );

  const go = (next: string) => {
    setPath(next);
    onPathChange?.(next);
  };

  const breadcrumbs = data?.breadcrumbs ?? [];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-[13px]">
        <button
          onClick={() => go("")}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Home className="size-3.5" />
          Root
        </button>
        {breadcrumbs.map((b) => (
          <span key={b.path} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground/50" />
            <button
              onClick={() => go(b.path)}
              className="rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {b.name}
            </button>
          </span>
        ))}
        {isFetching && !isLoading && (
          <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="min-h-[14rem] rounded-lg border border-border">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : !data || data.entries.length === 0 ? (
          <EmptyState
            icon={Folder}
            title="Empty folder"
            description="No items here."
            className="border-0 bg-transparent py-12"
          />
        ) : (
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto">
            {data.entries.map((entry) => (
              <li key={entry.path}>
                <button
                  disabled={!entry.isDir}
                  onClick={() => entry.isDir && go(entry.path)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                    entry.isDir
                      ? "hover:bg-muted/60"
                      : "cursor-default opacity-70",
                  )}
                >
                  {entry.isDir ? (
                    <Folder className="size-4 shrink-0 text-accent" />
                  ) : (
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {entry.name}
                  </span>
                  {!entry.isDir && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatBytes(entry.sizeBytes)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
