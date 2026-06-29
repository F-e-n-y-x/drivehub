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
      <div className="h-[calc(100dvh-11rem)] min-h-[420px] overflow-hidden rounded-xl border border-border bg-[#111114] p-1.5">
        <iframe
          title="DriveHub terminal"
          src={`${data.path}/`}
          className="h-full w-full"
          // ttyd needs to capture keyboard/clipboard
          allow="clipboard-read; clipboard-write"
          // The terminal is same-origin (proxied), so inject scrollbar styling
          // to match the app instead of ttyd's bright default.
          onLoad={(e) => {
            try {
              const doc = e.currentTarget.contentDocument;
              if (!doc) return;
              const style = doc.createElement("style");
              style.textContent = `
                :root, body { color-scheme: dark; background: #111114; }
                *::-webkit-scrollbar { width: 10px; height: 10px; }
                *::-webkit-scrollbar-track { background: transparent; }
                *::-webkit-scrollbar-thumb { background-color: rgba(130,130,140,.32); border-radius: 9999px; border: 2px solid transparent; background-clip: content-box; }
                *::-webkit-scrollbar-thumb:hover { background-color: rgba(130,130,140,.5); }
                * { scrollbar-width: thin; scrollbar-color: rgba(130,130,140,.4) transparent; }
              `;
              doc.head.appendChild(style);
            } catch {
              /* cross-origin (shouldn't happen) — ignore */
            }
          }}
        />
      </div>
    </div>
  );
}
