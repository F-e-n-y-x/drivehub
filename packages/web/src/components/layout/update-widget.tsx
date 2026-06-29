import { useNavigate } from "react-router-dom";
import { ArrowUpCircle } from "lucide-react";
import { useUpdates } from "@/hooks/queries";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Pinned at the bottom of the sidebar. When an update is available it shows a
 * compact, tappable card that deep-links to the Settings → Updates section.
 * Renders nothing when everything is up to date.
 */
export function UpdateWidget({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const { data } = useUpdates();

  if (!data?.anyAvailable) return null;

  const components: string[] = [];
  if (data.rclone.updateAvailable) components.push("rclone");
  if (data.app.updateAvailable) components.push("DriveHub");

  const count = components.length;
  const summary =
    count === 0
      ? "Update available"
      : `${components.join(" & ")} ${count > 1 ? "have" : "has"} an update`;

  const go = () => navigate("/settings#updates");

  if (collapsed) {
    return (
      <SimpleTooltip label="Update available" side="right">
        <button
          onClick={go}
          aria-label="Update available"
          className="relative flex w-full items-center justify-center rounded-lg py-2 text-accent transition-colors hover:bg-accent-muted"
        >
          <ArrowUpCircle className="size-[18px]" />
          <span className="absolute right-2.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-card" />
        </button>
      </SimpleTooltip>
    );
  }

  return (
    <button
      onClick={go}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-lg border border-accent/30 bg-accent-muted/60 px-2.5 py-2 text-left transition-colors hover:bg-accent-muted",
      )}
    >
      <ArrowUpCircle className="mt-0.5 size-[18px] shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">
          Update available
        </p>
        <p className="truncate text-xs text-muted-foreground">{summary}</p>
      </div>
    </button>
  );
}
