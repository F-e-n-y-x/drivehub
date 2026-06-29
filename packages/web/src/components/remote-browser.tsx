import { useState } from "react";
import {
  ChevronRight,
  Folder,
  File as FileIcon,
  FolderPlus,
  Home,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import type { RemoteEntry } from "@drivehub/types";
import { useBrowse, useBrowseMutations } from "@/hooks/queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QueryError } from "@/components/query-error";
import { EmptyState } from "@/components/empty-state";
import { NamePromptDialog } from "@/components/name-prompt-dialog";
import { cn, formatBytes } from "@/lib/utils";

/**
 * Folder browser for a single remote. Drives the path picker inside the job
 * dialog. `onPathChange` reports the current folder so callers can use it as a
 * selected path.
 *
 * Beyond navigation it offers light folder management — New folder in the
 * current directory, plus per-folder Rename and Delete via a hover/`…` menu —
 * reusing the same remote file-ops the Browser page uses. When `readOnly` is
 * set (e.g. a read-only source remote) these actions are hidden.
 */
export function RemoteBrowser({
  remoteId,
  initialPath = "",
  onPathChange,
  readOnly = false,
  className,
}: {
  remoteId: string;
  initialPath?: string;
  onPathChange?: (path: string) => void;
  /** Hide the create/rename/delete actions (read-only source remotes). */
  readOnly?: boolean;
  className?: string;
}) {
  const [path, setPath] = useState(initialPath);
  const { data, isLoading, isError, refetch, isFetching } = useBrowse(
    remoteId,
    path,
  );
  // Scoped to the folder currently shown; each op invalidates this listing.
  const ops = useBrowseMutations(remoteId, path);

  // Action dialog state.
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RemoteEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RemoteEntry | null>(null);

  const go = (next: string) => {
    setPath(next);
    onPathChange?.(next);
  };

  const breadcrumbs = data?.breadcrumbs ?? [];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-[13px]">
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
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="size-4" />
            New folder
          </Button>
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
            description={
              readOnly ? "No items here." : "Use New folder to add one here."
            }
            className="border-0 bg-transparent py-12"
          />
        ) : (
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto">
            {data.entries.map((entry) => (
              <li key={entry.path} className="group flex items-center">
                <button
                  disabled={!entry.isDir}
                  onClick={() => entry.isDir && go(entry.path)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm",
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
                {/* Per-folder actions (Rename / Delete) — folders only, and
                    never for read-only sources. Revealed on row hover/focus. */}
                {!readOnly && entry.isDir && (
                  <div className="flex shrink-0 items-center gap-0.5 pr-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      aria-label={`Rename ${entry.name}`}
                      title="Rename"
                      onClick={() => setRenameTarget(entry)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      aria-label={`Delete ${entry.name}`}
                      title="Delete"
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* New folder — created in the current directory, then the listing
          refreshes (handled by the mutation's invalidation). */}
      <NamePromptDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        label="Folder name"
        placeholder="Untitled folder"
        confirmLabel="Create"
        pending={ops.mkdir.isPending}
        onConfirm={(name) =>
          ops.mkdir.mutate(name, { onSuccess: () => setNewFolderOpen(false) })
        }
      />

      {/* Rename a folder. */}
      <NamePromptDialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        title="Rename folder"
        description={
          renameTarget ? `Renaming "${renameTarget.name}".` : undefined
        }
        label="New name"
        initialValue={renameTarget?.name ?? ""}
        confirmLabel="Rename"
        pending={ops.rename.isPending}
        onConfirm={(newName) => {
          if (!renameTarget) return;
          ops.rename.mutate(
            { entryPath: renameTarget.path, newName },
            { onSuccess: () => setRenameTarget(null) },
          );
        }}
      />

      {/* Delete a folder (confirm). */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete folder?"}
            </DialogTitle>
            <DialogDescription>
              This permanently removes it from the remote, including all folder
              contents. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={ops.remove.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                ops.remove.mutate(
                  [{ path: deleteTarget.path, isDir: deleteTarget.isDir }],
                  { onSuccess: () => setDeleteTarget(null) },
                );
              }}
            >
              {ops.remove.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
