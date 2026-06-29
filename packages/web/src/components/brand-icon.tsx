import type { ComponentType, SVGProps } from "react";
import {
  SiGoogledrive,
  SiDropbox,
  SiBackblaze,
  SiIcloud,
} from "react-icons/si";
import { DiOnedrive } from "react-icons/di";
import { FaAws } from "react-icons/fa6";
import {
  HardDrive,
  Server,
  HardDriveDownload,
  Cloud,
  type LucideIcon,
} from "lucide-react";
import type { RemoteType } from "@drivehub/types";
import { cn } from "@/lib/utils";

/**
 * RemoteIcon — the single source of truth for storage-provider iconography.
 *
 * Brand marks come from `react-icons` (simple-icons `si/*`, plus a couple of
 * fallbacks from `di/*` and `fa6/*` for marks that simple-icons has since
 * removed). Non-brand transports (local disk, NAS, WebDAV, SFTP) use lucide
 * glyphs so they read as "generic infrastructure" rather than a vendor.
 *
 * By default brand icons render in their brand color; pass a `className` with a
 * text-color utility (e.g. `text-accent`, `text-muted-foreground`) to override
 * it — the override wins because it's applied after the inline color.
 */

type IconType = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon;

interface BrandSpec {
  Icon: IconType;
  /** Brand color (used unless the caller overrides via className text color). */
  color?: string;
  /** True for vendor brand marks; false for generic lucide transport glyphs. */
  brand: boolean;
}

const SPEC: Record<RemoteType, BrandSpec> = {
  drive: { Icon: SiGoogledrive, color: "#1FA463", brand: true },
  dropbox: { Icon: SiDropbox, color: "#0061FF", brand: true },
  onedrive: { Icon: DiOnedrive, color: "#0078D4", brand: true },
  s3: { Icon: FaAws, color: "#FF9900", brand: true },
  b2: { Icon: SiBackblaze, color: "#E21E29", brand: true },
  icloud: { Icon: SiIcloud, color: "#3693F3", brand: true },
  local: { Icon: HardDrive, brand: false },
  smb: { Icon: HardDriveDownload, brand: false },
  webdav: { Icon: Server, brand: false },
  sftp: { Icon: Server, brand: false },
};

const FALLBACK: BrandSpec = { Icon: Cloud, brand: false };

export interface RemoteIconProps {
  type: RemoteType;
  className?: string;
  /**
   * When false, brand colors are suppressed and the icon inherits `currentColor`
   * (useful inside colored chips/avatars). Defaults to true.
   */
  colored?: boolean;
}

export function RemoteIcon({ type, className, colored = true }: RemoteIconProps) {
  const spec = SPEC[type] ?? FALLBACK;
  const { Icon, color, brand } = spec;

  // Brand color applies only to brand marks, only when `colored` is on, and is
  // skipped when the caller passes an explicit text-color so the override wins.
  const useBrandColor =
    brand && colored && color && !/(^|\s)text-/.test(className ?? "");

  return (
    <Icon
      className={cn("size-5 shrink-0", className)}
      style={useBrandColor ? { color } : undefined}
      aria-hidden="true"
    />
  );
}
