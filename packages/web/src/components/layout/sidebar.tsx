import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { navItems } from "./nav";
import { useUIStore } from "@/store/ui";
import { useConflicts } from "@/hooks/queries";
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

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const { data: conflicts } = useConflicts();
  const unresolved = conflicts?.filter((c) => !c.resolved).length ?? 0;

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col border-r border-border bg-card/40 transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-60",
      )}
    >
      <Logo collapsed={collapsed} />

      <nav className="flex-1 space-y-0.5 px-2.5 py-2">
        {navItems.map((item) => {
          const badgeCount = item.badge === "conflicts" ? unresolved : 0;
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
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
                  <item.icon className="size-[18px] shrink-0" />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && badgeCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-conflict/15 px-1.5 text-[11px] font-semibold text-conflict tabular-nums">
                      {badgeCount}
                    </span>
                  )}
                  {collapsed && badgeCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-conflict" />
                  )}
                </>
              )}
            </NavLink>
          );

          return collapsed ? (
            <SimpleTooltip key={item.to} label={item.label} side="right">
              {link}
            </SimpleTooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className="border-t border-border p-2.5">
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
