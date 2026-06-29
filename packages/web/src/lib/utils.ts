import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Human-readable byte size, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  const formatted = i === 0 ? String(value) : value.toFixed(decimals);
  return `${formatted} ${sizes[i]}`;
}

/** Compact integer formatting with grouping, e.g. 12345 -> "12,345". */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

/** Human-readable duration between two epoch-ms timestamps. */
export function formatDuration(
  startMs: number,
  endMs: number | null | undefined,
): string {
  if (!endMs) return "—";
  const ms = Math.max(0, endMs - startMs);
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Transfer rate, e.g. 1048576 -> "1.0 MB/s". */
export function formatSpeed(bytesPerSec: number | null | undefined): string {
  if (!bytesPerSec) return "0 B/s";
  return `${formatBytes(bytesPerSec)}/s`;
}

/** Relative time from an epoch-ms timestamp, e.g. "2 minutes ago". */
export function formatRelativeTime(ms: number | null | undefined): string {
  if (!ms) return "never";
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 3600_000],
    ["month", 30 * 24 * 3600_000],
    ["day", 24 * 3600_000],
    ["hour", 3600_000],
    ["minute", 60_000],
    ["second", 1000],
  ];
  if (abs < 30_000) return "just now";
  for (const [unit, unitMs] of units) {
    if (abs >= unitMs) return rtf.format(Math.round(diff / unitMs), unit);
  }
  return "just now";
}
