import { useEffect, useState } from "react";
import {
  ChevronRight,
  CornerLeftUp,
  Folder,
  HardDrive,
  Loader2,
} from "lucide-react";
import type { FsEntry } from "@drivehub/types";
import { useFsBrowse } from "@/hooks/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-error";
import { entryIcon } from "@/lib/file-icons";
import { cn, formatBytes } from "@/lib/utils";
import type { ApiError } from "@/lib/api";

const QUICK_JUMPS: Array<{ label: string; path: string }> = [
  { label: "/data/sync", path: "/data/sync" },
  { label: "/data", path: "/data" },
  { label: "/mnt", path: "/mnt" },
  { label: "Root", path: "/" },
];

/** Splits an absolute POSIX path into clickable breadcrumb segments. */
function crumbsFor(path: string): Array<{ name: string; path: string }> {
  if (!path || path === "/") return [];
  const parts = path.split("/").filter(Boolean);
  const out: Array<{ name: string; path: string }> = [];
  let acc = "";
  for (const part of parts) {
    acc += `/${part}`;
    out.push({ name: part, path: acc });
  }
  return out;
}

/**
 * A container-filesystem directory picker. Folders are the primary, navigable
 * items; files are shown muted/disabled. The current path doubles as the
 * selected folder and stays in sync with an editable path input.
 */
export function FolderPicker({
  value,
  onChange,
}: {
  /** The currently selected absolute path. */
  value: string;
  /** Called when the user picks a folder ("Use this folder"). */
  onChange: (path: string) => void;
}) {
  // Where the browser is currently looking. Starts at the selected value (or
  // a sensible default) and is what the listing query keys off.
  const [browsePath, setBrowsePath] = useState(value || "/data/sync");
  // The editable path input — typing navigates the browser there.
  const [draft, setDraft] = useState(browsePath);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useFsBrowse(browsePath);

  // Keep the input in sync as we navigate, and follow the resolved path the
  // server reports back (it may normalize/clamp to a real directory).
  useEffect(() => {
    if (data?.path) {
      setBrowsePath(data.path);
      setDraft(data.path);
    }
  }, [data?.path]);

  const navigate = (path: string) => {
    setBrowsePath(path);
    setDraft(path);
  };

  const commitDraft = () => {
    const next = draft.trim();
    if (next && next !== browsePath) setBrowsePath(next);
  };

  const crumbs = crumbsFor(data?.path ?? browsePath);
  const dirs = (data?.entries ?? []).filter((e) => e.isDir);
  const files = (data?.entries ?? []).filter((e) => !e.isDir);
  const ordered: FsEntry[] = [...dirs, ...files];

  const selected = data?.path ?? browsePath;
  const isSelected = value === selected;

  return (
    <div className="space-y-2.5">
      {/* Quick-jump chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_JUMPS.map((j) => (
          <button
            key={j.path}
            type="button"
            onClick={() => navigate(j.path)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              (data?.path ?? browsePath) === j.path
                ? "border-accent/50 bg-accent-muted text-accent"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {j.label}
          </button>
        ))}
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-[13px]">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <HardDrive className="size-3.5" />
        </button>
        {crumbs.map((c) => (
          <span key={c.path} className="flex shrink-0 items-center gap-0.5">
            <ChevronRight className="size-3.5 text-muted-foreground/50" />
            <button
              type="button"
              onClick={() => navigate(c.path)}
              className="rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {c.name}
            </button>
          </span>
        ))}
        {isFetching && !isLoading && (
          <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Listing */}
      <div className="h-56 overflow-y-auto rounded-lg border border-border">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-4">
            <QueryError
              message={(error as ApiError | undefined)?.message}
              onRetry={() => refetch()}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {/* Up affordance */}
            {data?.parent != null && (
              <li>
                <button
                  type="button"
                  onClick={() => navigate(data.parent as string)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <CornerLeftUp className="size-4 shrink-0" />
                  <span>Up one level</span>
                </button>
              </li>
            )}
            {ordered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No sub-folders here.
              </li>
            ) : (
              ordered.map((entry) => {
                const Icon = entryIcon(entry.name, entry.isDir);
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      disabled={!entry.isDir}
                      onClick={() => entry.isDir && navigate(entry.path)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                        entry.isDir
                          ? "hover:bg-muted/60"
                          : "cursor-default opacity-50",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          entry.isDir ? "text-accent" : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {entry.name}
                      </span>
                      {!entry.isDir && entry.sizeBytes != null && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatBytes(entry.sizeBytes)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {/* Editable path + Use this folder */}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
          }}
          onBlur={commitDraft}
          placeholder="/data/sync"
          className="font-mono text-[13px]"
          aria-label="Folder path"
        />
        <Button
          type="button"
          variant={isSelected ? "outline" : "accent"}
          onClick={() => onChange(selected)}
          className="shrink-0"
        >
          <Folder className="size-4" />
          {isSelected ? "Selected" : "Use this folder"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        USB drives and NAS shares mounted on the host appear here under their
        mount path (e.g. /mnt/...). To connect a NAS over the network instead,
        add an SMB remote.
      </p>
    </div>
  );
}
