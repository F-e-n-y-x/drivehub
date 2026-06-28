import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight, FolderTree, Home, Search, FolderOpen } from "lucide-react";
import type { DriveNode } from "@drivehub/types";
import { useAccounts, useDriveListing } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { NodeIcon } from "@/components/file-icon";
import { StatusBadge } from "@/components/status-badge";
import { AccountAvatar } from "@/components/account-avatar";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { remoteStateMeta } from "@/lib/status";
import { formatBytes, cn } from "@/lib/utils";

function Breadcrumbs({
  crumbs,
  onNavigate,
}: {
  crumbs: Array<{ id: string; name: string }>;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={c.id} className="flex items-center gap-1">
            <button
              onClick={() => !last && onNavigate(c.id)}
              disabled={last}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors",
                last
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {i === 0 && <Home className="size-3.5" />}
              <span className="max-w-[160px] truncate">{c.name}</span>
            </button>
            {!last && (
              <ChevronRight className="size-3.5 text-muted-foreground/40" />
            )}
          </span>
        );
      })}
    </nav>
  );
}

function NodeRow({
  node,
  onOpen,
}: {
  node: DriveNode;
  onOpen: (node: DriveNode) => void;
}) {
  const isFolder = node.type === "folder";
  const meta = remoteStateMeta(node.syncState);

  return (
    <div
      role={isFolder ? "button" : undefined}
      tabIndex={isFolder ? 0 : undefined}
      onClick={() => isFolder && onOpen(node)}
      onKeyDown={(e) => {
        if (isFolder && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(node);
        }
      }}
      className={cn(
        "group grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4 py-2.5 text-sm transition-colors sm:grid-cols-[1fr_120px_140px_120px]",
        isFolder && "cursor-pointer hover:bg-muted/50",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <NodeIcon node={node} />
        <span className="truncate font-medium text-foreground">
          {node.name}
        </span>
        {isFolder && (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
        )}
      </div>
      <span className="hidden text-right text-xs text-muted-foreground tabular-nums sm:block">
        {isFolder ? "—" : formatBytes(node.sizeBytes)}
      </span>
      <span className="hidden text-right text-xs text-muted-foreground tabular-nums sm:block">
        {node.modifiedTime
          ? format(new Date(node.modifiedTime), "MMM d, HH:mm")
          : "—"}
      </span>
      <div className="flex justify-end">
        <StatusBadge meta={meta} />
      </div>
    </div>
  );
}

export function ViewerPage() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const [params, setParams] = useSearchParams();
  const [folderId, setFolderId] = useState("root");
  const [search, setSearch] = useState("");

  const accountId = params.get("account") ?? accounts?.[0]?.id ?? null;

  // Reset to root when switching accounts.
  useEffect(() => {
    setFolderId("root");
    setSearch("");
  }, [accountId]);

  const {
    data: listing,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useDriveListing(accountId, folderId);

  const filtered = useMemo(() => {
    const nodes = listing?.nodes ?? [];
    const q = search.trim().toLowerCase();
    const matched = q
      ? nodes.filter((n) => n.name.toLowerCase().includes(q))
      : nodes;
    // Folders first, then alphabetical.
    return [...matched].sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [listing, search]);

  const selectAccount = (id: string) => {
    params.set("account", id);
    setParams(params, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drive Viewer"
        description="Browse the live Drive contents and sync state for each account."
      />

      {accountsLoading ? (
        <Skeleton className="h-9 w-64 rounded-lg" />
      ) : accounts && accounts.length > 0 && accountId ? (
        <Tabs value={accountId} onValueChange={selectAccount}>
          <TabsList className="h-auto flex-wrap">
            {accounts.map((a) => (
              <TabsTrigger key={a.id} value={a.id} className="gap-2">
                <AccountAvatar
                  email={a.email}
                  name={a.name}
                  picture={a.picture}
                  size={18}
                />
                <span className="max-w-[160px] truncate">{a.email}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : (
        <EmptyState
          icon={FolderTree}
          title="No accounts to browse"
          description="Connect a Google account to explore its Drive contents."
        />
      )}

      {accountId && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <Breadcrumbs
              crumbs={
                listing?.breadcrumbs ?? [{ id: "root", name: "My Drive" }]
              }
              onNavigate={setFolderId}
            />
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter this folder…"
                className="h-8 pl-8"
              />
            </div>
          </div>

          <div className="hidden grid-cols-[1fr_120px_140px_120px] gap-4 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Name</span>
            <span className="text-right">Size</span>
            <span className="text-right">Modified</span>
            <span className="text-right">Status</span>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border/60">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-[18px] rounded" />
                  <Skeleton className="h-3.5 w-48" />
                  <div className="flex-1" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-4">
              <QueryError onRetry={() => refetch()} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={search ? Search : FolderOpen}
              title={search ? "No matches" : "This folder is empty"}
              description={
                search
                  ? `Nothing here matches "${search}".`
                  : "There are no files or folders to show."
              }
              className="m-3 border-0 bg-transparent"
            />
          ) : (
            <div className={cn(isFetching && "opacity-60 transition-opacity")}>
              {filtered.map((node) => (
                <NodeRow key={node.id} node={node} onOpen={(n) => setFolderId(n.id)} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
