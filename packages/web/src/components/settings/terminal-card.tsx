import { useState } from "react";
import { Check, Copy, ExternalLink, TerminalSquare, TriangleAlert } from "lucide-react";
import { useTerminal } from "@/hooks/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-[13px] text-foreground">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-synced" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

export function TerminalCard() {
  const { data } = useTerminal();
  // The terminal serves on its own port on the same host as the web UI.
  const url =
    typeof window !== "undefined" && data
      ? `${window.location.protocol}//${window.location.hostname}:${data.port}`
      : "";

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <TerminalSquare className="size-4 text-muted-foreground" />
            Web terminal
          </CardTitle>
          <CardDescription>
            A shell into the container for <span className="font-mono text-foreground">rclone config</span>,
            S3/SFTP/WebDAV setup, and debugging — no need to install rclone elsewhere.
          </CardDescription>
        </div>
        {data &&
          (data.running ? (
            <Badge variant="synced">Running</Badge>
          ) : data.enabled ? (
            <Badge variant="pending">Starting…</Badge>
          ) : (
            <Badge variant="paused">Disabled</Badge>
          ))}
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.enabled && data.password ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <CopyField label="URL" value={url} />
              <CopyField label="User" value={data.user} />
              <CopyField label="Password" value={data.password} />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-pending/10 p-3 text-xs leading-relaxed text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-pending" />
              <span>
                This is a full shell on a self-hosted, unauthenticated app. Keep it on a trusted
                network only, and turn it off when you're done.
              </span>
            </div>
            <a href={url} target="_blank" rel="noreferrer" className="inline-block">
              <Button variant="accent" size="sm" disabled={!data.running}>
                <ExternalLink className="size-4" />
                Open terminal
              </Button>
            </a>
          </>
        ) : (
          <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              Disabled by default (it's a full shell on an unauthenticated app). To enable it, set
              <span className="font-mono text-foreground"> ENABLE_TERMINAL=true</span> on the
              container and redeploy. It runs behind a password shown here, on port
              <span className="font-mono text-foreground"> 7681</span> (publish it in your compose
              ports). Optionally set <span className="font-mono text-foreground">TERMINAL_PASSWORD</span>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
