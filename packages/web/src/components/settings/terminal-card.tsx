import { Link } from "react-router-dom";
import { ExternalLink, TerminalSquare, TriangleAlert } from "lucide-react";
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

export function TerminalCard() {
  const { data } = useTerminal();

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
        {data?.enabled ? (
          <>
            <div className="flex items-start gap-2 rounded-lg bg-pending/10 p-3 text-xs leading-relaxed text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-pending" />
              <span>
                Opens a full shell into the container (as the user the app runs as). On a
                self-hosted, unauthenticated app, keep it on a trusted network only and turn it off
                when you're done.
              </span>
            </div>
            <Link to="/terminal" className="inline-block">
              <Button variant="accent" size="sm" disabled={!data.running}>
                <ExternalLink className="size-4" />
                Open terminal
              </Button>
            </Link>
          </>
        ) : (
          <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              Disabled by default (it's a full shell on an unauthenticated app). To enable it, set
              <span className="font-mono text-foreground"> ENABLE_TERMINAL=true</span> on the
              container and redeploy. It then appears in the sidebar and opens inline — no extra port
              or password needed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
