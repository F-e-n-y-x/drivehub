import type {
  AccountStatus,
  RemoteState,
  ActivityLevel,
} from "@drivehub/types";
import type { BadgeProps } from "@/components/ui/badge";

type Tone = "synced" | "pending" | "conflict" | "error" | "paused" | "default";

export interface StatusMeta {
  tone: Tone;
  label: string;
  /** Tailwind text/bg color token name for the dot. */
  dotClass: string;
  badgeVariant: NonNullable<BadgeProps["variant"]>;
}

const toneToDot: Record<Tone, string> = {
  synced: "bg-synced",
  pending: "bg-pending",
  conflict: "bg-conflict",
  error: "bg-danger",
  paused: "bg-paused",
  default: "bg-muted-foreground",
};

const toneToBadge: Record<Tone, NonNullable<BadgeProps["variant"]>> = {
  synced: "synced",
  pending: "pending",
  conflict: "conflict",
  error: "error",
  paused: "paused",
  default: "default",
};

function make(tone: Tone, label: string): StatusMeta {
  return {
    tone,
    label,
    dotClass: toneToDot[tone],
    badgeVariant: toneToBadge[tone],
  };
}

export function accountStatusMeta(status: AccountStatus): StatusMeta {
  switch (status) {
    case "active":
      return make("synced", "Active");
    case "paused":
      return make("paused", "Paused");
    case "error":
      return make("error", "Error");
    case "reauth_required":
      return make("pending", "Reauth needed");
  }
}

export function remoteStateMeta(state: RemoteState | "unknown"): StatusMeta {
  switch (state) {
    case "synced":
      return make("synced", "Synced");
    case "pending":
      return make("pending", "Pending");
    case "conflict":
      return make("conflict", "Conflict");
    case "error":
      return make("error", "Error");
    case "unknown":
      return make("default", "Unknown");
  }
}

export function activityLevelMeta(level: ActivityLevel): StatusMeta {
  switch (level) {
    case "success":
      return make("synced", "Success");
    case "info":
      return make("default", "Info");
    case "warning":
      return make("pending", "Warning");
    case "error":
      return make("error", "Error");
  }
}
