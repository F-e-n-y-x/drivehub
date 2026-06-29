import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  Eye,
  FilePlus,
  FolderPlus,
  HardDrive,
  Home,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Scissors,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { RemoteEntry, RemotePublic } from "@drivehub/types";
import { useBrowse, useBrowseMutations, useRemotes } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SimpleSelect,
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { QueryError } from "@/components/query-error";
import { EmptyState } from "@/components/empty-state";
import { RemoteIcon } from "@/components/brand-icon";
import { NamePromptDialog } from "@/components/name-prompt-dialog";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { entryIcon } from "@/lib/file-icons";
import { remoteTypeLabel } from "@/lib/remotes";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { fileUrl, type ApiError, type TransferOpInput } from "@/lib/api";
import { useClipboardStore } from "@/store/clipboard";
import { useBrowserTabsStore, type BrowserTab } from "@/store/browser-tabs";

type SortKey = "name" | "size" | "modified";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "grid";

/**
 * INTERACTION MODEL (select vs open)
 * ----------------------------------
 * A leading checkbox column owns selection. Clicking a row's blank area or its
 * checkbox SELECTS (plain = single, Cmd/Ctrl = toggle, Shift = range). To OPEN,
 * you act on the name itself: clicking a folder name navigates into it; clicking
 * a file name opens the preview. The trailing chevron on folders also opens, and
 * double-clicking a row opens (navigate folder / preview file) as a discoverable
 * shortcut. This way navigation and multi-select never fight. Esc clears the
 * selection (or closes the preview). Right-click opens a context menu of actions.
 * Grid view mirrors this: the tile is a selection target, the name/icon opens.
 */

export function BrowserPage() {
  const { data: remotes, isLoading: remotesLoading } = useRemotes();
  const tabs = useBrowserTabsStore((s) => s.tabs);
  const activeTabId = useBrowserTabsStore((s) => s.activeTabId);
  const addTab = useBrowserTabsStore((s) => s.addTab);
  const closeTab = useBrowserTabsStore((s) => s.closeTab);
  const setActive = useBrowserTabsStore((s) => s.setActive);
  const updateActiveTab = useBrowserTabsStore((s) => s.updateActiveTab);

  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]!;

  // Deep link: `/browser?remote=<id>` (e.g. the "Browse" button on a remote
  // card) lands directly on that remote's root. If the active tab is already
  // pointed elsewhere, open a fresh tab so we don't clobber the user's place;
  // otherwise just point the active tab there. The param is consumed once.
  useEffect(() => {
    const wanted = searchParams.get("remote");
    if (!wanted || !remotes) return;
    const exists = remotes.some((r) => r.id === wanted);
    if (exists) {
      if (activeTab.remoteId && activeTab.remoteId !== wanted) {
        addTab({ remoteId: wanted, path: "" });
      } else {
        updateActiveTab({ remoteId: wanted, path: "" });
      }
    }
    // Clear the param either way so a refresh doesn't re-trigger this.
    searchParams.delete("remote");
    setSearchParams(searchParams, { replace: true });
    // Run once per deep-link; `remotes` gates it until the list is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remotes]);

  // Seed the active tab with the first remote once remotes load (only if it has
  // none yet — never clobber a tab the user has already pointed somewhere).
  useEffect(() => {
    if (searchParams.get("remote")) return; // let the deep-link effect win
    if (!activeTab.remoteId && remotes && remotes.length > 0) {
      updateActiveTab({ remoteId: remotes[0]!.id });
    }
  }, [remotes, activeTab.remoteId, updateActiveTab, searchParams]);

  const remoteById = useMemo(() => {
    const m = new Map<string, RemotePublic>();
    for (const r of remotes ?? []) m.set(r.id, r);
    return m;
  }, [remotes]);

  return (
    <div className="flex h-full min-h-[32rem] w-full flex-col gap-6">
      <PageHeader
        title="Remote Browser"
        description="Browse, organize, and manage files on any connected remote."
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
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <TabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            remoteById={remoteById}
            onSelect={setActive}
            onClose={closeTab}
            onAdd={() => addTab({ remoteId: activeTab.remoteId })}
          />
          <FileManager
            key={activeTab.id}
            remoteId={activeTab.remoteId ?? ""}
            path={activeTab.path}
            onPathChange={(path) => updateActiveTab({ path })}
            remoteSelector={
              <RemoteSelector
                remotes={remotes}
                value={activeTab.remoteId ?? ""}
                onChange={(remoteId) =>
                  // Switching remote resets to that remote's root.
                  updateActiveTab({ remoteId, path: "" })
                }
              />
            }
          />
        </div>
      )}
    </div>
  );
}

/** Basename of a path, or "" at the root. */
function basename(path: string): string {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** The short title shown on a tab: folder name, else remote label, else hint. */
function tabTitle(tab: BrowserTab, remote: RemotePublic | undefined): string {
  const base = basename(tab.path);
  if (base) return base;
  if (remote) return remote.label;
  return "New tab";
}

// --- Tab strip (Explorer / browser-style) -----------------------------------

function TabStrip({
  tabs,
  activeTabId,
  remoteById,
  onSelect,
  onClose,
  onAdd,
}: {
  tabs: BrowserTab[];
  activeTabId: string;
  remoteById: Map<string, RemotePublic>;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}) {
  const multiple = tabs.length > 1;
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 pt-1.5">
      {tabs.map((tab) => {
        const remote = tab.remoteId ? remoteById.get(tab.remoteId) : undefined;
        const active = tab.id === activeTabId;
        const title = tabTitle(tab, remote);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(tab.id);
              }
            }}
            title={remote ? `${remote.label} · /${tab.path}` : title}
            className={cn(
              "group flex min-w-[8rem] max-w-[14rem] shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-[13px] transition-colors",
              active
                ? "border-accent bg-card font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            {remote ? (
              <RemoteIcon type={remote.type} className="size-3.5" />
            ) : (
              <HardDrive className="size-3.5 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {multiple && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                aria-label={`Close ${title}`}
                title="Close tab"
                className="-mr-1 shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        aria-label="New tab"
        title="New tab"
        className="my-1 ml-0.5 flex size-7 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// --- Two-line remote selector -----------------------------------------------

function RemoteSelector({
  remotes,
  value,
  onChange,
}: {
  remotes: RemotePublic[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = remotes.find((r) => r.id === value);
  return (
    <div className="w-full sm:w-72">
      <SelectRoot value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label="Select remote"
          className="h-auto min-h-[3.25rem] min-w-[14rem] py-1.5"
        >
          {selected ? (
            <RemoteLines remote={selected} />
          ) : (
            <span className="text-muted-foreground/70">Select a remote…</span>
          )}
        </SelectTrigger>
        <SelectContent>
          {remotes.map((r) => (
            <SelectItem key={r.id} value={r.id} className="py-1.5">
              <RemoteLines remote={r} />
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </div>
  );
}

/** Two-line remote presentation: icon + label, then a muted secondary line. */
function RemoteLines({ remote }: { remote: RemotePublic }) {
  const secondary = remote.summary.email?.trim() || remoteTypeLabel(remote.type);
  return (
    <span className="flex min-w-0 items-center gap-2 text-left">
      <RemoteIcon type={remote.type} className="size-5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-foreground">
          {remote.label}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {secondary}
        </span>
      </span>
    </span>
  );
}

function FileManager({
  remoteId,
  path,
  onPathChange,
  remoteSelector,
}: {
  remoteId: string;
  path: string;
  onPathChange: (path: string) => void;
  remoteSelector: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<ViewMode>("list");

  // Selection state — set of entry paths, plus an anchor for shift-range.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  // Dialog state.
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RemoteEntry | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<RemoteEntry[] | null>(null);
  const [previewEntry, setPreviewEntry] = useState<RemoteEntry | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useBrowse(
    remoteId,
    path,
  );
  const ops = useBrowseMutations(remoteId, path);
  const clipboard = useClipboardStore();

  const breadcrumbs = data?.breadcrumbs ?? [];
  const entries = data?.entries ?? [];

  const go = (next: string) => {
    onPathChange(next);
    setQuery("");
    setSelected(new Set());
    setAnchor(null);
  };

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

  // --- Selection helpers ----------------------------------------------------

  const byPath = useMemo(() => {
    const m = new Map<string, RemoteEntry>();
    for (const e of entries) m.set(e.path, e);
    return m;
  }, [entries]);

  const selectedEntries = useMemo(
    () =>
      [...selected]
        .map((p) => byPath.get(p))
        .filter((e): e is RemoteEntry => !!e),
    [selected, byPath],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const onRowSelect = useCallback(
    (entry: RemoteEntry, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
      const path = entry.path;
      if (e.shiftKey && anchor) {
        const order = visible.map((v) => v.path);
        const a = order.indexOf(anchor);
        const b = order.indexOf(path);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelected(new Set(order.slice(lo, hi + 1)));
          return;
        }
      }
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
        setAnchor(path);
        return;
      }
      // Plain click: select just this one.
      setSelected(new Set([path]));
      setAnchor(path);
    },
    [anchor, visible],
  );

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === visible.length && visible.length > 0
        ? new Set()
        : new Set(visible.map((v) => v.path)),
    );
  }, [visible]);

  // --- Open (navigate / preview) -------------------------------------------

  const open = (entry: RemoteEntry) => {
    if (entry.isDir) go(entry.path);
    else setPreviewEntry(entry);
  };

  // --- Clipboard ops --------------------------------------------------------

  const copyToClipboard = (entries: RemoteEntry[], op: "copy" | "cut") => {
    if (entries.length === 0) return;
    clipboard.set(
      op,
      remoteId,
      entries.map((e) => ({ path: e.path, name: e.name, isDir: e.isDir })),
    );
  };

  const paste = () => {
    if (!clipboard.op || !clipboard.remoteId || clipboard.entries.length === 0)
      return;
    const op = clipboard.op === "cut" ? "move" : "copy";
    const payload: TransferOpInput[] = clipboard.entries.map((e) => ({
      srcRemoteId: clipboard.remoteId!,
      srcPath: e.path,
      dstRemoteId: remoteId,
      dstPath: path ? `${path}/${e.name}` : e.name,
      op,
    }));
    ops.paste.mutate(payload, {
      onSuccess: () => {
        // Cut consumes the clipboard; copy keeps it for repeat pastes.
        if (clipboard.op === "cut") clipboard.clear();
        clearSelection();
      },
    });
  };

  const downloadEntries = (entries: RemoteEntry[]) => {
    for (const e of entries) {
      if (e.isDir) continue;
      const a = document.createElement("a");
      a.href = fileUrl(remoteId, e.path, true);
      a.download = e.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  // --- Keyboard: Esc clears selection --------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !previewEntry) {
        // Don't interfere with dialogs (they handle their own Esc).
        if (newFolderOpen || newFileOpen || renameTarget || deleteTargets) return;
        if (selected.size > 0) clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selected.size,
    clearSelection,
    previewEntry,
    newFolderOpen,
    newFileOpen,
    renameTarget,
    deleteTargets,
  ]);

  const folderCount = entries.filter((e) => e.isDir).length;
  const fileCount = entries.length - folderCount;
  const allSelected = visible.length > 0 && selected.size === visible.length;
  const someSelected = selected.size > 0 && !allSelected;
  const selectedFiles = selectedEntries.filter((e) => !e.isDir);
  const single = selectedEntries.length === 1 ? selectedEntries[0]! : null;
  const clipboardCount = clipboard.entries.length;

  // The preview lightbox pages through the current folder's *files* (skipping
  // folders), in the same order they're shown. Memoized so the open preview
  // keeps a stable sibling list as it navigates.
  const previewSiblings = useMemo(
    () => visible.filter((e) => !e.isDir),
    [visible],
  );
  const previewIndex = previewEntry
    ? previewSiblings.findIndex((e) => e.path === previewEntry.path)
    : -1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="size-4" />
            New folder
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNewFileOpen(true)}>
            <FilePlus className="size-4" />
            New file
          </Button>

          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

          <Button
            variant="ghost"
            size="sm"
            disabled={!single}
            onClick={() => single && setRenameTarget(single)}
          >
            <Pencil className="size-4" />
            Rename
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={selectedEntries.length === 0}
            onClick={() => copyToClipboard(selectedEntries, "copy")}
          >
            <Copy className="size-4" />
            Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={selectedEntries.length === 0}
            onClick={() => copyToClipboard(selectedEntries, "cut")}
          >
            <Scissors className="size-4" />
            Cut
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={clipboardCount === 0 || ops.paste.isPending}
            onClick={paste}
          >
            {ops.paste.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Clipboard className="size-4" />
            )}
            Paste
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={selectedFiles.length === 0}
            onClick={() => downloadEntries(selectedFiles)}
          >
            <Download className="size-4" />
            Download
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger/10 hover:text-danger"
            disabled={selectedEntries.length === 0}
            onClick={() => setDeleteTargets(selectedEntries)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {clipboardCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                <Clipboard className="size-3.5" />
                {clipboardCount} {clipboard.op === "cut" ? "cut" : "copied"}
                <button
                  onClick={() => clipboard.clear()}
                  className="rounded p-0.5 hover:text-foreground"
                  aria-label="Clear clipboard"
                  title="Clear clipboard"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            )}
            {selected.size > 0 && (
              <span className="flex items-center gap-1.5 rounded-md bg-accent-muted px-2 py-1 text-xs font-medium text-accent">
                {selected.size} selected
                <button
                  onClick={clearSelection}
                  className="rounded p-0.5 hover:text-accent/70"
                  aria-label="Clear selection"
                  title="Clear selection (Esc)"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            )}
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
            description="Use New folder or New file to add something here."
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
          <ListView
            entries={visible}
            selected={selected}
            allSelected={allSelected}
            someSelected={someSelected}
            onToggleAll={toggleAll}
            onSelect={onRowSelect}
            onOpen={open}
            actions={(entry) => (
              <RowMenu
                entry={entry}
                selectedEntries={selectedEntries}
                clipboardCount={clipboardCount}
                pastePending={ops.paste.isPending}
                onOpen={open}
                onRename={setRenameTarget}
                onDelete={setDeleteTargets}
                onCopy={(e) => copyToClipboard(e, "copy")}
                onCut={(e) => copyToClipboard(e, "cut")}
                onPaste={paste}
                onDownload={downloadEntries}
              />
            )}
            onContextMenuRow={(entry) => {
              if (!selected.has(entry.path)) {
                setSelected(new Set([entry.path]));
                setAnchor(entry.path);
              }
            }}
          />
        ) : (
          <GridView
            entries={visible}
            selected={selected}
            onSelect={onRowSelect}
            onOpen={open}
            actions={(entry) => (
              <RowMenu
                entry={entry}
                selectedEntries={selectedEntries}
                clipboardCount={clipboardCount}
                pastePending={ops.paste.isPending}
                onOpen={open}
                onRename={setRenameTarget}
                onDelete={setDeleteTargets}
                onCopy={(e) => copyToClipboard(e, "copy")}
                onCut={(e) => copyToClipboard(e, "cut")}
                onPaste={paste}
                onDownload={downloadEntries}
              />
            )}
            onContextMenuRow={(entry) => {
              if (!selected.has(entry.path)) {
                setSelected(new Set([entry.path]));
                setAnchor(entry.path);
              }
            }}
          />
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

      {/* Dialogs */}
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
      <NamePromptDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        title="New file"
        label="File name"
        placeholder="untitled.txt"
        confirmLabel="Create"
        pending={ops.touch.isPending}
        onConfirm={(name) =>
          ops.touch.mutate(name, { onSuccess: () => setNewFileOpen(false) })
        }
      />
      <NamePromptDialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        title="Rename"
        description={renameTarget ? `Renaming "${renameTarget.name}".` : undefined}
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
      <DeleteDialog
        targets={deleteTargets}
        pending={ops.remove.isPending}
        onCancel={() => setDeleteTargets(null)}
        onConfirm={() => {
          if (!deleteTargets) return;
          ops.remove.mutate(
            deleteTargets.map((e) => ({ path: e.path, isDir: e.isDir })),
            {
              onSuccess: () => {
                setDeleteTargets(null);
                clearSelection();
              },
            },
          );
        }}
      />
      <FilePreviewDialog
        open={!!previewEntry}
        onOpenChange={(o) => !o && setPreviewEntry(null)}
        remoteId={remoteId}
        entry={previewEntry}
        siblings={previewSiblings}
        index={previewIndex}
        onNavigate={(i) => {
          const next = previewSiblings[i];
          if (next) setPreviewEntry(next);
        }}
      />
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

// --- Context menu (shared by list + grid rows) ------------------------------

function RowMenu({
  entry,
  selectedEntries,
  clipboardCount,
  pastePending,
  onOpen,
  onRename,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  onDownload,
}: {
  entry: RemoteEntry;
  selectedEntries: RemoteEntry[];
  clipboardCount: number;
  pastePending: boolean;
  onOpen: (e: RemoteEntry) => void;
  onRename: (e: RemoteEntry) => void;
  onDelete: (e: RemoteEntry[]) => void;
  onCopy: (e: RemoteEntry[]) => void;
  onCut: (e: RemoteEntry[]) => void;
  onPaste: () => void;
  onDownload: (e: RemoteEntry[]) => void;
}) {
  // The menu acts on the multi-selection if the right-clicked row is part of
  // it; otherwise it acts on just that row (and selects it for clarity).
  const inSelection = selectedEntries.some((s) => s.path === entry.path);
  const targets = inSelection && selectedEntries.length > 0 ? selectedEntries : [entry];
  const multi = targets.length > 1;
  const files = targets.filter((t) => !t.isDir);

  return (
    <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
      {!multi && (
        <ContextMenuItem onSelect={() => onOpen(entry)}>
          {entry.isDir ? <Search /> : <Eye />}
          {entry.isDir ? "Open" : "Preview"}
        </ContextMenuItem>
      )}
      <ContextMenuItem
        disabled={multi}
        onSelect={() => !multi && onRename(entry)}
      >
        <Pencil />
        Rename
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onCopy(targets)}>
        <Copy />
        Copy{multi ? ` (${targets.length})` : ""}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onCut(targets)}>
        <Scissors />
        Cut{multi ? ` (${targets.length})` : ""}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={clipboardCount === 0 || pastePending}
        onSelect={onPaste}
      >
        <Clipboard />
        Paste{clipboardCount > 0 ? ` (${clipboardCount})` : ""}
      </ContextMenuItem>
      {files.length > 0 && (
        <ContextMenuItem onSelect={() => onDownload(files)}>
          <Download />
          Download{files.length > 1 ? ` (${files.length})` : ""}
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem destructive onSelect={() => onDelete(targets)}>
        <Trash2 />
        Delete{multi ? ` (${targets.length})` : ""}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

// --- Views ------------------------------------------------------------------

interface RowEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

function ListView({
  entries,
  selected,
  allSelected,
  someSelected,
  onToggleAll,
  onSelect,
  onOpen,
  actions,
  onContextMenuRow,
}: {
  entries: RemoteEntry[];
  selected: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  onSelect: (entry: RemoteEntry, e: RowEvent) => void;
  onOpen: (entry: RemoteEntry) => void;
  actions: (entry: RemoteEntry) => React.ReactNode;
  onContextMenuRow: (entry: RemoteEntry) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-[1] bg-card">
        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
          <th className="w-10 px-3 py-2">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={onToggleAll}
              aria-label="Select all"
            />
          </th>
          <th className="px-2 py-2 font-medium">Name</th>
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
          const isSel = selected.has(entry.path);
          return (
            <ContextMenu key={entry.path}>
              <ContextMenuTrigger asChild>
                <tr
                  onClick={(e) =>
                    onSelect(entry, {
                      metaKey: e.metaKey,
                      ctrlKey: e.ctrlKey,
                      shiftKey: e.shiftKey,
                    })
                  }
                  onContextMenu={() => onContextMenuRow(entry)}
                  onDoubleClick={() => onOpen(entry)}
                  className={cn(
                    "group cursor-pointer border-b border-border/50 transition-colors",
                    isSel ? "bg-accent-muted/60" : "hover:bg-muted/40",
                  )}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSel}
                      onChange={(_v, ev) =>
                        onSelect(entry, {
                          metaKey: ev.metaKey,
                          ctrlKey: ev.ctrlKey,
                          shiftKey: ev.shiftKey,
                        })
                      }
                      aria-label={`Select ${entry.name}`}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          isDir ? "text-accent" : "text-muted-foreground",
                        )}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(entry);
                        }}
                        title={entry.name}
                        className={cn(
                          "min-w-0 flex-1 truncate text-left hover:underline",
                          isDir
                            ? "font-medium text-foreground"
                            : "text-foreground/90",
                        )}
                      >
                        {entry.name}
                      </button>
                      {isDir && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(entry);
                          }}
                          aria-label={`Open ${entry.name}`}
                          className="shrink-0 rounded p-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70 hover:!text-foreground"
                        >
                          <ChevronRight className="size-3.5" />
                        </button>
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
              </ContextMenuTrigger>
              {actions(entry)}
            </ContextMenu>
          );
        })}
      </tbody>
    </table>
  );
}

function GridView({
  entries,
  selected,
  onSelect,
  onOpen,
  actions,
  onContextMenuRow,
}: {
  entries: RemoteEntry[];
  selected: Set<string>;
  onSelect: (entry: RemoteEntry, e: RowEvent) => void;
  onOpen: (entry: RemoteEntry) => void;
  actions: (entry: RemoteEntry) => React.ReactNode;
  onContextMenuRow: (entry: RemoteEntry) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {entries.map((entry) => {
        const Icon = entryIcon(entry.name, entry.isDir, entry.mimeType);
        const isDir = entry.isDir;
        const isSel = selected.has(entry.path);
        return (
          <ContextMenu key={entry.path}>
            <ContextMenuTrigger asChild>
              <div
                onClick={(e) =>
                  onSelect(entry, {
                    metaKey: e.metaKey,
                    ctrlKey: e.ctrlKey,
                    shiftKey: e.shiftKey,
                  })
                }
                onContextMenu={() => onContextMenuRow(entry)}
                onDoubleClick={() => onOpen(entry)}
                title={entry.name}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
                  isSel
                    ? "border-accent/40 bg-accent-muted/60"
                    : "border-transparent hover:border-border hover:bg-muted/40",
                )}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(entry);
                  }}
                  aria-label={isDir ? `Open ${entry.name}` : `Preview ${entry.name}`}
                >
                  <Icon
                    className={cn(
                      "size-9",
                      isDir ? "text-accent" : "text-muted-foreground",
                    )}
                  />
                </button>
                <span className="w-full truncate text-[13px] font-medium text-foreground">
                  {entry.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {isDir ? "Folder" : formatBytes(entry.sizeBytes)}
                </span>
              </div>
            </ContextMenuTrigger>
            {actions(entry)}
          </ContextMenu>
        );
      })}
    </div>
  );
}

// --- Checkbox (token-styled, supports indeterminate) ------------------------

function Checkbox({
  checked,
  indeterminate,
  onChange,
  ...rest
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean, event: RowEvent) => void;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={() => {}}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, {
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
        });
      }}
      className="size-4 shrink-0 cursor-pointer rounded border-input accent-accent"
      {...rest}
    />
  );
}

// --- Delete confirm dialog --------------------------------------------------

function DeleteDialog({
  targets,
  pending,
  onCancel,
  onConfirm,
}: {
  targets: RemoteEntry[] | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const count = targets?.length ?? 0;
  const single = count === 1 ? targets![0]! : null;
  const hasFolder = !!targets?.some((t) => t.isDir);
  return (
    <Dialog open={!!targets} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {single ? `Delete "${single.name}"?` : `Delete ${count} items?`}
          </DialogTitle>
          <DialogDescription>
            This permanently removes {single ? "it" : "them"} from the remote
            {hasFolder ? ", including all folder contents" : ""}. This can't be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Delete{count > 1 ? ` ${count}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-4 shrink-0 rounded" />
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
