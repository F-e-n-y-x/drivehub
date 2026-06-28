import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-muted-foreground",
        outline: "border-border bg-transparent text-foreground",
        accent:
          "border-transparent bg-accent-muted text-accent",
        synced:
          "border-transparent bg-synced/10 text-synced",
        pending:
          "border-transparent bg-pending/10 text-pending",
        conflict:
          "border-transparent bg-conflict/10 text-conflict",
        error: "border-transparent bg-danger/10 text-danger",
        paused: "border-transparent bg-paused/10 text-paused",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
