import { useState } from "react";
import { Loader2, Plug, Trash2 } from "lucide-react";
import type { RemotePublic } from "@drivehub/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/status-dot";
import { remoteIcon, remoteTypeLabel } from "@/lib/remotes";
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

export function RemoteCard({ remote }: { remote: RemotePublic }) {
  const Icon = remoteIcon(remote.type);
  const status = remoteStatusMeta(remote.status);
  const { test, remove } = useRemoteMutations();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const summaryEntries = Object.entries(remote.summary).slice(0, 4);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {remote.label}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {remoteTypeLabel(remote.type)}
          </p>
        </div>
        <Badge variant={status.badgeVariant}>
          <StatusDot className={status.dotClass} />
          {status.label}
        </Badge>
      </div>

      {summaryEntries.length > 0 && (
        <dl className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
          {summaryEntries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground capitalize">{k}</dt>
              <dd className="truncate font-mono text-[11px] text-foreground">
                {v}
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
