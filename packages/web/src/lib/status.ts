import type {
  ActivityLevel,
  JobStatus,
  RemoteStatus,
} from "@drivehub/types";
import type { BadgeProps } from "@/components/ui/badge";

type Tone = "synced" | "pending" | "conflict" | "error" | "paused" | "default";

export interface StatusMeta {
  tone: Tone;
  label: string;
  /** Tailwind bg color token name for the dot. */
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

export function remoteStatusMeta(status: RemoteStatus): StatusMeta {
  switch (status) {
    case "ok":
      return make("synced", "Connected");
    case "error":
      return make("error", "Error");
    case "unconfigured":
      return make("pending", "Not configured");
  }
}

export function jobStatusMeta(status: JobStatus): StatusMeta {
  switch (status) {
    case "success":
      return make("synced", "Success");
    case "running":
      return make("pending", "Running");
    case "queued":
      return make("pending", "Queued");
    case "error":
      return make("error", "Error");
    case "idle":
      return make("default", "Idle");
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
