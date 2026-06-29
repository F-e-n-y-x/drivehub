import { useState } from "react";
import {
  ArrowUpCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { ComponentUpdate, UpdateStatus } from "@drivehub/types";
import { useUpdates, useUpdateActions } from "@/hooks/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";

const GHCR_URL =
  "https://github.com/F-e-n-y-x/drivehub/pkgs/container/drivehub";

function StatusPill({ updateAvailable }: { updateAvailable: boolean }) {
  return updateAvailable ? (
    <Badge variant="pending">
      <ArrowUpCircle className="size-3" />
      Update available
    </Badge>
  ) : (
    <Badge variant="synced">
      <Check className="size-3" />
      Up to date
    </Badge>
  );
}

function VersionRow({
  component,
  children,
}: {
  component: ComponentUpdate;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium capitalize text-foreground">
            {component.name === "drivehub" ? "DriveHub" : component.name}
          </p>
          <StatusPill updateAvailable={component.updateAvailable} />
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{component.current ?? "unknown"}</span>
          {component.updateAvailable && component.latest && (
            <>
              {" → "}
              <span className="font-mono text-foreground">
                {component.latest}
              </span>
            </>
          )}
        </p>
      </div>
      {children}
    </div>
  );
}

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-foreground">
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy command"
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? (
          <Check className="size-3.5 text-synced" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}

function RcloneRow({ data }: { data: UpdateStatus }) {
  const { updateRclone } = useUpdateActions();
  const r = data.rclone;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <VersionRow component={r}>
          {r.updateAvailable && r.canSelfUpdate && (
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={updateRclone.isPending}
              onClick={() => updateRclone.mutate()}
            >
              {updateRclone.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="size-4" />
              )}
              Update rclone now
            </Button>
          )}
          {r.updateAvailable && !r.canSelfUpdate && (
            <div className="space-y-2.5 rounded-lg bg-muted/40 p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                rclone is the bundled <span className="font-medium text-foreground">rclone-extra</span>{" "}
                fork (native TeraBox &amp; more) — it updates with the DriveHub
                image. Redeploy to get the newer version:
              </p>
              <CopyableCommand command="docker compose pull && docker compose up -d" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                In Portainer: Update the stack → tick "Re-pull image".
              </p>
            </div>
          )}
        </VersionRow>
      </CardContent>
    </Card>
  );
}

function AppRow({ data }: { data: UpdateStatus }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <VersionRow component={data.app}>
          {data.app.updateAvailable && (
            <div className="space-y-2.5 rounded-lg bg-muted/40 p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                DriveHub updates by redeploying the container.
                {data.dockerAvailable
                  ? " Re-pull the image and recreate the container:"
                  : " Pull the latest image and recreate the container:"}
              </p>
              <CopyableCommand command="docker compose pull && docker compose up -d" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                In Portainer: Stacks → your stack → Update the stack → tick
                "Re-pull image".
              </p>
              <a
                href={GHCR_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                View image on GHCR
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </VersionRow>
      </CardContent>
    </Card>
  );
}

export function UpdatesSection() {
  const { data, isLoading } = useUpdates();
  const { checkNow } = useUpdateActions();

  return (
    <section id="updates" className="scroll-mt-24">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Updates
          </h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `Last checked ${formatRelativeTime(data.checkedAt)}.`
              : "Keep rclone and DriveHub up to date."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={checkNow.isPending}
          onClick={() => checkNow.mutate()}
        >
          {checkNow.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Check for updates
        </Button>
      </div>
      <div className="space-y-3 pt-5">
        {isLoading || !data ? (
          <>
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </>
        ) : (
          <>
            <RcloneRow data={data} />
            <AppRow data={data} />
          </>
        )}
      </div>
    </section>
  );
}
