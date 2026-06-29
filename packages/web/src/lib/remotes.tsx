import {
  Cloud,
  HardDrive,
  HardDriveDownload,
  Box,
  Server,
  FolderSync,
  type LucideIcon,
} from "lucide-react";
import type { RemoteType, JobMode, Schedule } from "@drivehub/types";

const ICONS: Record<RemoteType, LucideIcon> = {
  local: HardDrive,
  s3: Cloud,
  b2: Box,
  drive: FolderSync,
  dropbox: Box,
  onedrive: Cloud,
  icloud: Cloud,
  webdav: Server,
  smb: HardDriveDownload,
  sftp: Server,
};

export function remoteIcon(type: RemoteType): LucideIcon {
  return ICONS[type] ?? Cloud;
}

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
