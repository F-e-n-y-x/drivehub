import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/status-dot";
import type { StatusMeta } from "@/lib/status";

export function StatusBadge({
  meta,
  pulse = false,
}: {
  meta: StatusMeta;
  pulse?: boolean;
}) {
  return (
    <Badge variant={meta.badgeVariant}>
      <StatusDot className={meta.dotClass} pulse={pulse} />
      {meta.label}
    </Badge>
  );
}
