import {
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileCode,
  Presentation,
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";
import type { DriveNode } from "@drivehub/types";
import { cn } from "@/lib/utils";

function pickIcon(node: DriveNode): { Icon: LucideIcon; color: string } {
  if (node.type === "folder")
    return { Icon: Folder, color: "text-accent" };

  const mime = node.mimeType ?? "";
  const name = node.name.toLowerCase();

  if (mime.startsWith("image/")) return { Icon: FileImage, color: "text-violet-500" };
  if (mime.startsWith("video/")) return { Icon: FileVideo, color: "text-rose-500" };
  if (mime.startsWith("audio/")) return { Icon: FileAudio, color: "text-amber-500" };
  if (mime.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(name))
    return { Icon: FileSpreadsheet, color: "text-emerald-600" };
  if (mime.includes("presentation") || /\.pptx?$/.test(name))
    return { Icon: Presentation, color: "text-orange-500" };
  if (mime.includes("document") || /\.(docx?|pdf|txt|md)$/.test(name))
    return { Icon: FileText, color: "text-sky-500" };
  if (/\.(zip|tar|gz|rar|7z)$/.test(name))
    return { Icon: FileArchive, color: "text-yellow-600" };
  if (/\.(js|ts|tsx|jsx|json|html|css|py|go|rs|java|sh)$/.test(name))
    return { Icon: FileCode, color: "text-indigo-500" };

  return { Icon: FileIcon, color: "text-muted-foreground" };
}

export function NodeIcon({
  node,
  className,
}: {
  node: DriveNode;
  className?: string;
}) {
  const { Icon, color } = pickIcon(node);
  return <Icon className={cn("size-[18px] shrink-0", color, className)} />;
}
