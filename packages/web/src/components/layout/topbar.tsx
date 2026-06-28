import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X, Wifi, WifiOff } from "lucide-react";
import { navItems } from "./nav";
import { SyncPill } from "@/components/sync-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { ConnectionState } from "@/hooks/use-server-events";
import { cn } from "@/lib/utils";

function LiveIndicator({ state }: { state: ConnectionState }) {
  const online = state === "open";
  return (
    <SimpleTooltip label={online ? "Live updates connected" : "Reconnecting…"}>
      <span
        className={cn(
          "hidden size-7 items-center justify-center rounded-md sm:inline-flex",
          online ? "text-synced" : "text-muted-foreground",
        )}
      >
        {online ? (
          <Wifi className="size-4" />
        ) : (
          <WifiOff className="size-4 animate-pulse" />
        )}
      </span>
    </SimpleTooltip>
  );
}

export function TopBar({ connection }: { connection: ConnectionState }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      <div className="flex-1" />

      <LiveIndicator state={connection} />
      <SyncPill />
      <ThemeToggle />

      {mobileOpen && (
        <div className="absolute inset-x-0 top-14 z-40 border-b border-border bg-card p-2 shadow-lg md:hidden">
          <nav className="space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60",
                  )
                }
              >
                <item.icon className="size-[18px]" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
