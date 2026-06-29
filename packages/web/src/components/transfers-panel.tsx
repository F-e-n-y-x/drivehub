import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FolderInput,
  Loader2,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  useTransfersStore,
  type Transfer,
  type TransferKind,
} from "@/store/transfers";
import { cn, formatBytes, formatSeconds, formatSpeed } from "@/lib/utils";

/** Icon per transfer kind. */
function kindIcon(kind: TransferKind) {
  switch (kind) {
    case "upload":
      return Upload;
    case "copy":
      return Copy;
    case "move":
      return FolderInput;
    case "delete":
      return Trash2;
  }
}

/**
 * Fixed bottom-right stack of transfer cards. Mounted once (in AppLayout) so it
 * persists across navigation. Shows live uploads (byte progress + speed + ETA +
 * cancel) and awaited copy/move/delete ops (indeterminate bar → Done/Failed).
 */
export function TransfersPanel() {
  const transfers = useTransfersStore((s) => s.transfers);
  const remove = useTransfersStore((s) => s.remove);
  const clearFinished = useTransfersStore((s) => s.clearFinished);
  const [collapsed, setCollapsed] = useState(false);

  if (transfers.length === 0) return null;

  const activeCount = transfers.filter((t) => t.status === "active").length;
  const multiple = transfers.length > 1;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="region"
      aria-label="Transfers"
    >
      {/* Header / controls — only when there's more than one card. */}
      {multiple && (
        <div className="pointer-events-auto flex items-center justify-between rounded-lg border border-border bg-popover/95 px-3 py-1.5 shadow-lg backdrop-blur">
          <span className="text-xs font-medium text-foreground">
            Transfers
            {activeCount > 0 && (
              <span className="ml-1.5 text-muted-foreground tabular-nums">
                {activeCount} active
              </span>
            )}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={clearFinished}
              className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand transfers" : "Collapse transfers"}
              title={collapsed ? "Expand" : "Collapse"}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {collapsed ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {transfers.map((t) => (
            <TransferCard key={t.id} transfer={t} onDismiss={() => remove(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TransferCard({
  transfer,
  onDismiss,
}: {
  transfer: Transfer;
  onDismiss: () => void;
}) {
  const Icon = kindIcon(transfer.kind);
  const { status } = transfer;
  const pct =
    transfer.progress !== null
      ? Math.round(transfer.progress * 100)
      : null;

  return (
    <div className="pointer-events-auto rounded-lg border border-border bg-popover/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
            status === "done"
              ? "bg-synced/10 text-synced"
              : status === "error"
                ? "bg-danger/10 text-danger"
                : "bg-accent-muted text-accent",
          )}
          aria-hidden
        >
          {status === "done" ? (
            <CheckCircle2 className="size-3.5" />
          ) : status === "error" ? (
            <XCircle className="size-3.5" />
          ) : (
            <Icon className="size-3.5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
              title={transfer.title}
            >
              {transfer.title}
            </span>

            {/* Cancel an active upload (has an aborter); otherwise dismiss. */}
            {status === "active" && transfer.abort ? (
              <button
                type="button"
                onClick={() => transfer.abort?.()}
                aria-label="Cancel"
                title="Cancel"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : status !== "active" ? (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                title="Dismiss"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            {status === "active" && transfer.progress === null ? (
              // Indeterminate (copy/move/delete): an animated sliding sliver.
              <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease_infinite] rounded-full bg-accent" />
            ) : (
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200",
                  status === "error" ? "bg-danger" : "bg-accent",
                )}
                style={{
                  width:
                    status === "done"
                      ? "100%"
                      : `${transfer.progress !== null ? transfer.progress * 100 : 100}%`,
                }}
              />
            )}
          </div>

          {/* Meta line */}
          <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
            <span className="truncate">
              {status === "done"
                ? "Done"
                : status === "error"
                  ? (transfer.error ?? "Failed")
                  : transfer.kind === "upload" && transfer.speedBps
                    ? `${formatSpeed(transfer.speedBps)} · ${formatSeconds(transfer.etaSec)} left`
                    : transfer.kind === "upload"
                      ? "Starting…"
                      : "Working…"}
            </span>
            {pct !== null && status === "active" && (
              <span className="ml-2 shrink-0 font-medium text-foreground">
                {pct}%
              </span>
            )}
            {status === "done" && (
              <span className="ml-2 shrink-0 font-medium text-synced">
                {formatBytesIfUpload(transfer)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Show the uploaded size on a finished upload card; blank otherwise. */
function formatBytesIfUpload(t: Transfer): string {
  if (t.kind === "upload" && t._total) return formatBytes(t._total);
  return "";
}
