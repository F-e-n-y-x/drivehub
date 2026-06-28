import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Eye, Pause, Play, Loader2, Trash2 } from "lucide-react";
import type { AccountPublic } from "@drivehub/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountAvatar } from "@/components/account-avatar";
import { QuotaBar } from "@/components/quota-bar";
import { StatusBadge } from "@/components/status-badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { accountStatusMeta } from "@/lib/status";
import { useAccountControl } from "@/hooks/queries";

export function AccountCard({
  account,
  showActions = true,
}: {
  account: AccountPublic;
  showActions?: boolean;
}) {
  const navigate = useNavigate();
  const { pause, resume, disconnect } = useAccountControl();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const meta = accountStatusMeta(account.status);
  const paused = account.status === "paused";
  const busy = pause.isPending || resume.isPending;
  const lastDelta = account.lastDeltaAt
    ? formatDistanceToNow(new Date(account.lastDeltaAt), { addSuffix: true })
    : "No sync yet";

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <AccountAvatar
          email={account.email}
          name={account.name}
          picture={account.picture}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {account.name ?? account.email}
          </p>
          {account.name && (
            <p className="truncate text-xs text-muted-foreground">
              {account.email}
            </p>
          )}
        </div>
        <StatusBadge meta={meta} pulse={account.status === "active"} />
      </div>

      <div className="mt-4">
        <QuotaBar
          used={account.quotaUsedBytes}
          total={account.quotaTotalBytes}
        />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="truncate">
          {account.rootFolderName ?? "Drive root"}
        </span>
        <SimpleTooltip
          label={
            account.lastDeltaAt
              ? new Date(account.lastDeltaAt).toLocaleString()
              : "Awaiting first delta"
          }
        >
          <span className="shrink-0">{lastDelta}</span>
        </SimpleTooltip>
      </div>

      {showActions && (
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate(`/viewer?account=${account.id}`)}
          >
            <Eye className="size-3.5" />
            Open in viewer
          </Button>
          <SimpleTooltip label={paused ? "Resume account" : "Pause account"}>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={busy}
              onClick={() =>
                paused ? resume.mutate(account.id) : pause.mutate(account.id)
              }
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : paused ? (
                <Play className="size-3.5" />
              ) : (
                <Pause className="size-3.5" />
              )}
            </Button>
          </SimpleTooltip>
          <SimpleTooltip label="Disconnect">
            <Button
              variant="outline"
              size="icon-sm"
              className="text-muted-foreground hover:text-danger"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </SimpleTooltip>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect this account?</DialogTitle>
            <DialogDescription>
              DriveHub will stop syncing{" "}
              <span className="font-medium text-foreground">
                {account.email}
              </span>
              . Files already in the hub folder are kept, but no further changes
              will be tracked for this account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(account.id, {
                  onSuccess: () => setConfirmOpen(false),
                })
              }
            >
              {disconnect.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
