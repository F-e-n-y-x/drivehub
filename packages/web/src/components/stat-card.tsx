import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "pending" | "conflict" | "error";

const toneIcon: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  accent: "bg-accent-muted text-accent",
  pending: "bg-pending/10 text-pending",
  conflict: "bg-conflict/10 text-conflict",
  error: "bg-danger/10 text-danger",
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  loading = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <div
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            toneIcon[tone],
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </div>
      )}
      {sub && !loading && (
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</p>
      )}
    </Card>
  );
}
