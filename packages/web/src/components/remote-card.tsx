import { useState } from "react";
import { Loader2, Mail, Plug, Trash2 } from "lucide-react";
import type { RemotePublic } from "@drivehub/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/status-dot";
import { RemoteIcon } from "@/components/brand-icon";
import { remoteTypeLabel } from "@/lib/remotes";
import { remoteStatusMeta } from "@/lib/status";
import { useRemoteMutations } from "@/hooks/queries";
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
  const status = remoteStatusMeta(remote.status);
  const { test, remove } = useRemoteMutations();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const email = remote.summary.email;
  const details = SUMMARY_FIELDS.filter(
    (f) => (remote.summary[f.key] ?? "").trim().length > 0,
  ).slice(0, 4);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
          <RemoteIcon type={remote.type} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {remote.label}
          </h3>
          {email ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="size-3 shrink-0" />
              <span className="truncate">{email}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {remoteTypeLabel(remote.type)}
            </p>
          )}
        </div>
        <Badge variant={status.badgeVariant}>
          <StatusDot className={status.dotClass} />
          {status.label}
        </Badge>
      </div>

      {details.length > 0 && (
        <dl className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
          {details.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd
                className="truncate font-mono text-[11px] text-foreground"
                title={remote.summary[f.key]}
              >
                {remote.summary[f.key]}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={test.isPending}
          onClick={() => test.mutate(remote.id)}
        >
          {test.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plug className="size-3.5" />
          )}
          Test
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete remote"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      </div>

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
