import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
  indeterminate = false,
}: {
  /** 0–1 fraction. Ignored when indeterminate. */
  value?: number;
  className?: string;
  indeterminate?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value ?? 0)) * 100;
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-accent transition-[width] duration-300",
          indeterminate && "w-1/3 animate-[indeterminate_1.4s_ease_infinite]",
        )}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
