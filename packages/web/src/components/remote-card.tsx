import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  FolderOpen,
  Gauge,
  Loader2,
  Mail,
  Pencil,
  Plug,
  Trash2,
} from "lucide-react";
import type { RemotePublic } from "@drivehub/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/status-dot";
import { RemoteIcon } from "@/components/brand-icon";
import { remoteTypeLabel } from "@/lib/remotes";
import { remoteStatusMeta } from "@/lib/status";
import {
  useRemoteAbout,
  useRemoteMutations,
  useRenameRemote,
  useRunSpeedTest,
  useSettings,
  useSpeedTest,
} from "@/hooks/queries";
import { Input } from "@/components/ui/input";
import { cn, formatBytes, formatRelativeTime, formatSpeed } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

/**
 * Keys we surface as a tidy summary, in priority order, with friendly labels.
 * Anything not in this list (e.g. raw rclone flags) is intentionally hidden so
 * the card stays clean — `email` is shown as the subtitle, not in this grid.
 */
const SUMMARY_FIELDS: Array<{ key: string; label: string }> = [
  { key: "bucket", label: "Bucket" },
  { key: "host", label: "Host" },
  { key: "endpoint", label: "Endpoint" },
  { key: "region", label: "Region" },
  { key: "path", label: "Path" },
  { key: "user", label: "User" },
];

export function RemoteCard({ remote }: { remote: RemotePublic }) {
  const navigate = useNavigate();
  const status = remoteStatusMeta(remote.status);
  const { test, remove } = useRemoteMutations();
  const rename = useRenameRemote();
  const speedTest = useRunSpeedTest();
  const lastSpeed = useSpeedTest(remote.id);
  const about = useRemoteAbout(remote.id);
  const settings = useSettings();
  const testSizeMb = settings.data?.speedTestSizeMb ?? 32;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editLabel, setEditLabel] = useState(remote.label);
  const [editEmail, setEditEmail] = useState(remote.summary.email ?? "");
  const speed = lastSpeed.data ?? null;

  // Re-seed the edit form whenever the dialog opens.
  useEffect(() => {
    if (renameOpen) {
      setEditLabel(remote.label);
      setEditEmail(remote.summary.email ?? "");
    }
  }, [renameOpen, remote.label, remote.summary.email]);

  const email = remote.summary.email;
  // Detail grid: Type is always shown; whitelist the rest, capped so the card
  // stays compact (Type already takes one slot of the 2-col grid).
  const summaryDetails = SUMMARY_FIELDS.filter(
    (f) => (remote.summary[f.key] ?? "").trim().length > 0,
  ).slice(0, 3);

  const runSpeedTest = () => speedTest.mutate(remote.id);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
          <RemoteIcon type={remote.type} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
            {remote.label}
          </h3>
          {email ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="size-3 shrink-0" />
              <span className="truncate">{email}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {remoteTypeLabel(remote.type)}
            </p>
          )}
        </div>
        <Badge variant={status.badgeVariant} className="shrink-0 self-start">
          <StatusDot className={status.dotClass} />
          {status.label}
        </Badge>
      </div>

      {/* Details grid */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5 text-xs">
        <Detail label="Type" value={remoteTypeLabel(remote.type)} />
        <Detail
          label="Added"
          value={formatRelativeTime(remote.createdAt)}
          title={new Date(remote.createdAt).toLocaleString()}
        />
        {summaryDetails.map((f) => (
          <Detail
            key={f.key}
            label={f.label}
            value={remote.summary[f.key] ?? ""}
            mono
          />
        ))}
      </dl>

      {/* Storage usage */}
      <StorageUsage
        loading={about.isLoading}
        about={about.data}
        error={about.isError}
      />

      {/* Speed test result (server-persisted; survives reload/navigation) */}
      {speed && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/60 px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">Throughput</span>
          <span className="flex items-center gap-1 tabular-nums text-foreground">
            <ArrowUp className="size-3.5 text-synced" />
            {speed.uploadBytesPerSec === null
              ? "—"
              : formatSpeed(speed.uploadBytesPerSec)}
          </span>
          <span className="flex items-center gap-1 tabular-nums text-foreground">
            <ArrowDown className="size-3.5 text-accent" />
            {speed.downloadBytesPerSec === null
              ? "—"
              : formatSpeed(speed.downloadBytesPerSec)}
          </span>
          {speed.at && (
            <span className="ml-auto text-muted-foreground/70">
              tested {formatRelativeTime(speed.at)}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Button
          variant="accent"
          size="sm"
          className="flex-1"
          onClick={() => navigate(`/browser?remote=${encodeURIComponent(remote.id)}`)}
        >
          <FolderOpen className="size-3.5" />
          Browse
        </Button>
        <SimpleTooltip label={`Uploads & downloads a ${testSizeMb} MB test file`}>
          <Button
            variant="outline"
            size="sm"
            disabled={speedTest.isPending}
            onClick={runSpeedTest}
          >
            {speedTest.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Gauge className="size-3.5" />
            )}
            {speedTest.isPending ? "Testing…" : "Speed test"}
          </Button>
        </SimpleTooltip>
        <div className="ml-auto flex items-center gap-1.5">
          <SimpleTooltip label="Test connection">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Test connection"
              disabled={test.isPending}
              onClick={() => test.mutate(remote.id)}
            >
              {test.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plug className="size-3.5" />
              )}
            </Button>
          </SimpleTooltip>
          <SimpleTooltip label="Rename remote">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Rename remote"
              onClick={() => setRenameOpen(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip label="Delete remote">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete remote"
              onClick={() => setConfirmOpen(true)}
              className="hover:bg-danger/10"
            >
              <Trash2 className="size-3.5 text-danger" />
            </Button>
          </SimpleTooltip>
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit remote</DialogTitle>
            <DialogDescription>
              Change how this remote appears. The email is just a label — set it
              when a backend can't report your account (e.g. TeraBox).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={editLabel}
                placeholder="My Drive"
                onChange={(e) => setEditLabel(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Email / account label <span className="font-normal">(optional)</span>
              </label>
              <Input
                value={editEmail}
                placeholder="you@example.com"
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!editLabel.trim() || rename.isPending}
              onClick={() =>
                rename.mutate(
                  { id: remote.id, label: editLabel.trim(), email: editEmail.trim() },
                  { onSuccess: () => setRenameOpen(false) },
                )
              }
            >
              {rename.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove "{remote.label}"?</DialogTitle>
            <DialogDescription>
              This removes the remote from DriveHub. Jobs that use it will stop
              working. Your stored data is not touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(remote.id, {
                  onSuccess: () => setConfirmOpen(false),
                })
              }
            >
              {remove.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** A single label/value row inside the compact details grid. */
function Detail({
  label,
  value,
  mono,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-foreground",
          mono ? "font-mono text-[11px]" : "text-xs",
        )}
        title={title ?? value}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Slim storage quota bar. Renders "used / total" with a percentage fill that
 * shifts to amber past 75% and rose past 90%. When the backend can't report
 * usage (nulls — common for some providers), we show a muted notice instead of
 * an error, since usage is informational, not load-bearing.
 */
function StorageUsage({
  loading,
  about,
  error,
}: {
  loading: boolean;
  about: { total: number | null; used: number | null; free: number | null } | undefined;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-32 rounded" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    );
  }

  const total = about?.total ?? null;
  const used = about?.used ?? null;
  const hasQuota =
    !error && total !== null && total > 0 && used !== null && used >= 0;

  if (!hasQuota) {
    // We can still show "used" alone if that's all we got (e.g. local disk
    // without a quota), otherwise mark it unavailable.
    if (!error && used !== null && used >= 0) {
      return (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatBytes(used)}
          </span>{" "}
          used
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">Usage unavailable</p>
    );
  }

  const pct = Math.min(100, Math.max(0, (used / total) * 100));
  const fill =
    pct > 90 ? "bg-conflict" : pct > 75 ? "bg-pending" : "bg-synced";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatBytes(used)}
          </span>{" "}
          of {formatBytes(total)}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
