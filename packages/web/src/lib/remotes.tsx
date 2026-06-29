import type { RemoteType, JobMode, Schedule } from "@drivehub/types";

// Storage-provider icons live in `@/components/brand-icon` (RemoteIcon) so the
// brand marks stay in one place. This module owns the text/labels only.

const TYPE_LABELS: Record<RemoteType, string> = {
  local: "Local disk",
  s3: "Amazon S3",
  b2: "Backblaze B2",
  drive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  icloud: "iCloud Drive",
  webdav: "WebDAV",
  smb: "SMB / NAS",
  sftp: "SFTP",
};

export function remoteTypeLabel(type: RemoteType): string {
  return TYPE_LABELS[type] ?? type;
}

export function modeLabel(mode: JobMode): string {
  switch (mode) {
    case "two_way":
      return "Two-way";
    case "mirror":
      return "Mirror";
    case "additive":
      return "Additive";
  }
}

export function modeHelp(mode: JobMode): string {
  switch (mode) {
    case "mirror":
      return "Exact copy, including deletions";
    case "additive":
      return "Copy new & changed; never delete";
    case "two_way":
      return "Bidirectional, conflict-aware sync";
  }
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function scheduleSummary(s: Schedule): string {
  switch (s.kind) {
    case "realtime":
      return "Real-time";
    case "manual":
      return "Manual";
    case "interval":
      return `Every ${s.intervalMinutes ?? 0} min`;
    case "daily":
      return `Daily at ${s.timeOfDay ?? "00:00"}`;
    case "weekly":
      return `${WEEKDAYS[s.weekday ?? 0]} at ${s.timeOfDay ?? "00:00"}`;
  }
}

export { WEEKDAYS };
