import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import { useServerEvents } from "@/hooks/use-server-events";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const connection = useServerEvents();
  const { pathname } = useLocation();

  // The Remote Browser is a file manager and wants the full content width;
  // every other page reads better in a comfortable centered column.
  const fullWidth = pathname === "/browser";

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar connection={connection} />
        {/*
          `relative` makes <main> the containing block for any absolutely
          positioned descendant — notably Radix's visually-hidden form inputs
          (e.g. the Switch checkbox). Without it those inputs resolve against
          <html>, escaping this scroll container and inflating the document's
          scrollHeight, which appears as phantom empty scroll space below the
          content (most visible on /settings).
        */}
        <main className="relative flex-1 overflow-y-auto">
          <div
            className={cn(
              "w-full py-8",
              fullWidth
                ? "px-5 sm:px-6"
                : "mx-auto max-w-[88rem] px-5 sm:px-8",
            )}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
