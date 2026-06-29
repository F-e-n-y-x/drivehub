import {
  File as FileIcon,
  FileArchive,
  FileCode,
  FileText,
  Film,
  Folder,
  Image,
  Music,
  type LucideIcon,
} from "lucide-react";

/** Maps a lowercased extension to a lucide icon. */
const EXT_ICONS: Record<string, LucideIcon> = {
  // images
  jpg: Image,
  jpeg: Image,
  png: Image,
  gif: Image,
  webp: Image,
  svg: Image,
  bmp: Image,
  ico: Image,
  heic: Image,
  avif: Image,
  // video
  mp4: Film,
  mov: Film,
  mkv: Film,
  avi: Film,
  webm: Film,
  m4v: Film,
  flv: Film,
  // audio
  mp3: Music,
  flac: Music,
  wav: Music,
  aac: Music,
  ogg: Music,
  m4a: Music,
  // archives
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  tgz: FileArchive,
  bz2: FileArchive,
  xz: FileArchive,
  rar: FileArchive,
  "7z": FileArchive,
  // documents
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  txt: FileText,
  md: FileText,
  rtf: FileText,
  odt: FileText,
  // code
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  json: FileCode,
  py: FileCode,
  rb: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  cs: FileCode,
  php: FileCode,
  sh: FileCode,
  yml: FileCode,
  yaml: FileCode,
  toml: FileCode,
  html: FileCode,
  css: FileCode,
  xml: FileCode,
  sql: FileCode,
};

/** Coarse mime-prefix fallback when the extension is unknown. */
function iconFromMime(mimeType: string | null | undefined): LucideIcon | null {
  if (!mimeType) return null;
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.startsWith("video/")) return Film;
  if (mimeType.startsWith("audio/")) return Music;
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.startsWith("text/")) return FileText;
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-tar" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-7z-compressed"
  ) {
    return FileArchive;
  }
  return null;
}

/**
 * Picks a type-aware icon for a file-system entry, keyed off `isDir` then the
 * file extension, falling back to the mime type and finally a generic file.
 */
export function entryIcon(
  name: string,
  isDir: boolean,
  mimeType?: string | null,
): LucideIcon {
  if (isDir) return Folder;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return EXT_ICONS[ext] ?? iconFromMime(mimeType) ?? FileIcon;
}
