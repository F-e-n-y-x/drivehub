import { NavLink } from "react-router-dom";
import {
  PanelLeftClose,
  PanelLeft,
  Github,
  Settings,
  Terminal,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { navItems } from "./nav";
import { UpdateWidget } from "./update-widget";
import { useTerminal } from "@/hooks/queries";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-14 items-center gap-2.5 px-4">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h4l2 3h5A2.5 2.5 0 0 1 20 9.5v6A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-9Z" />
        </svg>
      </div>
      {!collapsed && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          DriveHub
        </span>
      )}
    </div>
  );
}

/** A single sidebar nav link, with collapsed-state tooltip support. */
function NavItemLink({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  collapsed: boolean;
}) {
  const link = (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-opacity",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
          <Icon className="size-[18px] shrink-0" />
          {!collapsed && <span className="flex-1">{label}</span>}
        </>
      )}
    </NavLink>
  );

  return collapsed ? (
    <SimpleTooltip label={label} side="right">
      {link}
    </SimpleTooltip>
  ) : (
    link
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const showLogs = useUIStore((s) => s.showLogs);
  const terminal = useTerminal();

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col border-r border-border bg-card/40 transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-60",
      )}
    >
      <Logo collapsed={collapsed} />

      <nav className="flex-1 space-y-0.5 px-2.5 py-2">
        {navItems.map((item) => (
          <NavItemLink
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            end={item.to === "/"}
            collapsed={collapsed}
          />
        ))}
        {terminal.data?.enabled && (
          <NavItemLink
            to="/terminal"
            label="Terminal"
            icon={TerminalSquare}
            collapsed={collapsed}
          />
        )}
        {showLogs && (
          <NavItemLink
            to="/logs"
            label="Logs"
            icon={Terminal}
            collapsed={collapsed}
          />
        )}
        {/* Settings sits at the bottom of the nav (a common convention). */}
        <NavItemLink
          to="/settings"
          label="Settings"
          icon={Settings}
          collapsed={collapsed}
        />
      </nav>

      <div className="px-2.5 pb-1">
        <UpdateWidget collapsed={collapsed} />
      </div>

      <div className="space-y-0.5 border-t border-border p-2.5">
        {(() => {
          const repo = (
            <a
              href="https://github.com/F-e-n-y-x/drivehub"
              target="_blank"
              rel="noreferrer noopener"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <Github className="size-[18px] shrink-0" />
              {!collapsed && <span className="flex-1">GitHub</span>}
            </a>
          );
          return collapsed ? (
            <SimpleTooltip label="View on GitHub" side="right">
              {repo}
            </SimpleTooltip>
          ) : (
            repo
          );
        })()}

        <button
          onClick={toggle}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeft className="size-[18px]" />
          ) : (
            <>
              <PanelLeftClose className="size-[18px]" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
