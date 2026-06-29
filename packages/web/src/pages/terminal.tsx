import { TerminalSquare } from "lucide-react";
import { useTerminal } from "@/hooks/queries";
import { EmptyState } from "@/components/empty-state";

/**
 * Embeds the built-in web terminal (ttyd), which DriveHub reverse-proxies at a
 * same-origin path — so it loads inline with no separate port or password.
 */
export function TerminalPage() {
  const { data, isLoading } = useTerminal();

  if (isLoading) return null;
  if (!data?.enabled) {
    return (
      <EmptyState
        icon={TerminalSquare}
        title="Terminal is disabled"
        description="Set ENABLE_TERMINAL=true on the container and redeploy to use the in-app shell."
      />
    );
  }
  if (!data.running) {
    return (
      <EmptyState
        icon={TerminalSquare}
        title="Terminal is starting…"
        description="The shell isn't ready yet. Give it a moment and refresh."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Terminal</h1>
        <p className="text-sm text-muted-foreground">
          A shell into the container — run <span className="font-mono">rclone config</span>,{" "}
          <span className="font-mono">rclone authorize</span>, and more.
        </p>
      </div>
      <div className="h-[calc(100dvh-11rem)] min-h-[420px] overflow-hidden rounded-xl border border-border bg-black">
        <iframe
          title="DriveHub terminal"
          src={`${data.path}/`}
          className="h-full w-full"
          // ttyd needs to capture keyboard/clipboard
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
