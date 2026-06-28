import { cn } from "@/lib/utils";

export function StatusDot({
  className,
  pulse = false,
}: {
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-60 animate-live-pulse",
            className,
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex size-2 rounded-full",
          className,
        )}
      />
    </span>
  );
}
