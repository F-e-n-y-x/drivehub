import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronRight,
  HardDrive,
  Home,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  RotateCw,
  Search,
} from "lucide-react";
import type { RemoteEntry } from "@drivehub/types";
import { useBrowse, useRemotes } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-error";
import { EmptyState } from "@/components/empty-state";
import { RemoteIcon } from "@/components/brand-icon";
import { entryIcon } from "@/lib/file-icons";
import { remoteTypeLabel } from "@/lib/remotes";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import type { ApiError } from "@/lib/api";

type SortKey = "name" | "size" | "modified";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "grid";

export function BrowserPage() {
  const { data: remotes, isLoading: remotesLoading } = useRemotes();
  const [remoteId, setRemoteId] = useState("");

  // Default to the first remote once loaded.
  useEffect(() => {
    if (!remoteId && remotes && remotes.length > 0) {
      setRemoteId(remotes[0]!.id);
    }
  }, [remotes, remoteId]);

  return (
    <div className="flex h-full min-h-[32rem] flex-col gap-6">
      <PageHeader
        title="Remote Browser"
        description="Inspect the contents of any connected remote."
      />

      {remotesLoading ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : !remotes || remotes.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No remotes to browse"
          description="Connect a storage remote to browse its files here."
        />
      ) : (
        <FileManager
          key={remoteId}
          remoteId={remoteId}
          remoteSelector={
            <div className="w-full sm:w-64">
              <SimpleSelect
                value={remoteId}
                onValueChange={setRemoteId}
                aria-label="Select remote"
                options={remotes.map((r) => ({
                  value: r.id,
                  label: (
                    <span className="flex items-center gap-2">
                      <RemoteIcon type={r.type} className="size-4" />
                      <span className="truncate">{r.label}</span>
                      <span className="text-muted-foreground">
                        · {remoteTypeLabel(r.type)}
                      </span>
                    </span>
                  ),
                }))}
              />
            </div>
          }
        />
      )}
    </div>
  );
}

function FileManager({
  remoteId,
  remoteSelector,
}: {
  remoteId: string;
  remoteSelector: React.ReactNode;
}) {
  const [path, setPath] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<ViewMode>("list");

  const { data, isLoading, isError, error, refetch, isFetching } = useBrowse(
    remoteId,
    path,
  );

  const breadcrumbs = data?.breadcrumbs ?? [];

  const go = (next: string) => {
    setPath(next);
    setQuery("");
  };

  const entries = data?.entries ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.filter((e) => e.name.toLowerCase().includes(q))
      : entries.slice();

    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      // Folders always come first regardless of sort.
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (sortKey === "size") {
        cmp = a.sizeBytes - b.sizeBytes;
      } else {
        const at = a.modTime ? Date.parse(a.modTime) : 0;
        const bt = b.modTime ? Date.parse(b.modTime) : 0;
        cmp = at - bt;
      }
      if (cmp === 0) {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      return cmp * dir;
    });
    return filtered;
  }, [entries, query, sortKey, sortDir]);

  const folderCount = entries.filter((e) => e.isDir).length;
  const fileCount = entries.length - folderCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-card/95 p-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {remoteSelector}

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter this folder…"
              className="pl-9"
              aria-label="Filter files"
            />
          </div>

          <div className="flex items-center gap-2">
            <SortControl
              sortKey={sortKey}
              sortDir={sortDir}
              onKeyChange={setSortKey}
              onDirToggle={() =>
                setSortDir((d) => (d === "asc" ? "desc" : "asc"))
              }
            />
            <ViewToggle view={view} onChange={setView} />
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh"
              title="Refresh"
            >
              <RotateCw className={cn("size-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-0.5 overflow-x-auto text-[13px]">
          <button
            onClick={() => go("")}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Home className="size-3.5" />
            Root
          </button>
          {breadcrumbs.map((b) => (
            <span key={b.path} className="flex shrink-0 items-center gap-0.5">
              <ChevronRight className="size-3.5 text-muted-foreground/50" />
              <button
                onClick={() => go(b.path)}
                className="rounded-md px-1.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {b.name}
              </button>
            </span>
          ))}
          {isFetching && !isLoading && (
            <Loader2 className="ml-2 size-3.5 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <div className="p-6">
            <QueryError
              message={(error as ApiError | undefined)?.message}
              onRetry={() => refetch()}
            />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={entryIcon("", true)}
            title="This folder is empty"
            description="There's nothing to show here yet."
            className="m-6 border-0 bg-transparent"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description={`Nothing matches "${query.trim()}" in this folder.`}
            className="m-6 border-0 bg-transparent"
          />
        ) : view === "list" ? (
          <ListView entries={visible} onOpen={go} />
        ) : (
          <GridView entries={visible} onOpen={go} />
        )}
      </div>

      {/* Status footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>{summarize(folderCount, fileCount)}</span>
        {query.trim() && entries.length > 0 && (
          <span className="tabular-nums">
            {visible.length} match{visible.length === 1 ? "" : "es"}
          </span>
        )}
      </div>
    </div>
  );
}

function summarize(folders: number, files: number): string {
  if (folders === 0 && files === 0) return "Empty folder";
  const parts: string[] = [];
  if (folders > 0) parts.push(`${folders} folder${folders === 1 ? "" : "s"}`);
  if (files > 0) parts.push(`${files} file${files === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function modifiedLabel(modTime: string | null): string {
  if (!modTime) return "—";
  const ms = Date.parse(modTime);
  if (Number.isNaN(ms)) return "—";
  return formatRelativeTime(ms);
}

// --- Toolbar controls -------------------------------------------------------

function SortControl({
  sortKey,
  sortDir,
  onKeyChange,
  onDirToggle,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onKeyChange: (k: SortKey) => void;
  onDirToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-32">
        <SimpleSelect
          value={sortKey}
          onValueChange={(v) => onKeyChange(v as SortKey)}
          aria-label="Sort by"
          options={[
            { value: "name", label: "Name" },
            { value: "size", label: "Size" },
            { value: "modified", label: "Modified" },
          ]}
        />
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={onDirToggle}
        aria-label={sortDir === "asc" ? "Ascending" : "Descending"}
        title={sortDir === "asc" ? "Ascending" : "Descending"}
      >
        {sortDir === "asc" ? (
          <ArrowDownAZ className="size-4" />
        ) : (
          <ArrowUpAZ className="size-4" />
        )}
      </Button>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-border p-0.5">
      <button
        onClick={() => onChange("list")}
        aria-label="List view"
        title="List view"
        className={cn(
          "flex size-8 items-center justify-center rounded-md transition-colors",
          view === "list"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ListIcon className="size-4" />
      </button>
      <button
        onClick={() => onChange("grid")}
        aria-label="Grid view"
        title="Grid view"
        className={cn(
          "flex size-8 items-center justify-center rounded-md transition-colors",
          view === "grid"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-4" />
      </button>
    </div>
  );
}

// --- Views ------------------------------------------------------------------

function ListView({
  entries,
  onOpen,
}: {
  entries: RemoteEntry[];
  onOpen: (path: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-[1] bg-card">
        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
          <th className="px-4 py-2 font-medium">Name</th>
          <th className="hidden w-32 px-4 py-2 text-right font-medium sm:table-cell">
            Size
          </th>
          <th className="hidden w-40 px-4 py-2 text-right font-medium md:table-cell">
            Modified
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const Icon = entryIcon(entry.name, entry.isDir, entry.mimeType);
          const isDir = entry.isDir;
          return (
            <tr
              key={entry.path}
              onClick={() => isDir && onOpen(entry.path)}
              className={cn(
                "group border-b border-border/50 transition-colors",
                isDir ? "cursor-pointer hover:bg-muted/60" : "hover:bg-muted/30",
              )}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isDir ? "text-accent" : "text-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      isDir
                        ? "font-medium text-foreground"
                        : "text-foreground/90",
                    )}
                    title={entry.name}
                  >
                    {entry.name}
                  </span>
                  {isDir && (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
                  )}
                </div>
              </td>
              <td className="hidden px-4 py-2.5 text-right text-xs text-muted-foreground tabular-nums sm:table-cell">
                {isDir ? "" : formatBytes(entry.sizeBytes)}
              </td>
              <td className="hidden px-4 py-2.5 text-right text-xs text-muted-foreground md:table-cell">
                {modifiedLabel(entry.modTime)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GridView({
  entries,
  onOpen,
}: {
  entries: RemoteEntry[];
  onOpen: (path: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {entries.map((entry) => {
        const Icon = entryIcon(entry.name, entry.isDir, entry.mimeType);
        const isDir = entry.isDir;
        return (
          <button
            key={entry.path}
            disabled={!isDir}
            onClick={() => isDir && onOpen(entry.path)}
            title={entry.name}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border border-transparent p-4 text-center transition-colors",
              isDir
                ? "cursor-pointer hover:border-border hover:bg-muted/60"
                : "cursor-default hover:bg-muted/30",
            )}
          >
            <Icon
              className={cn(
                "size-9",
                isDir ? "text-accent" : "text-muted-foreground",
              )}
            />
            <span className="w-full truncate text-[13px] font-medium text-foreground">
              {entry.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {isDir ? "Folder" : formatBytes(entry.sizeBytes)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton
            className="h-4 rounded"
            style={{ width: `${40 + ((i * 13) % 45)}%` }}
          />
          <Skeleton className="ml-auto hidden h-3 w-16 rounded sm:block" />
        </div>
      ))}
    </div>
  );
}
