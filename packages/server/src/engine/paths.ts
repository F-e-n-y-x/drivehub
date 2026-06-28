import { access } from "node:fs/promises";

/** Parent directory of a POSIX relative path. "" for top-level items. */
export function dirOf(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i < 0 ? "" : relPath.slice(0, i);
}

/** Final path segment (file or folder name). */
export function baseOf(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i < 0 ? relPath : relPath.slice(i + 1);
}

export async function existsPath(absPath: string): Promise<boolean> {
  try {
    await access(absPath);
    return true;
  } catch {
    return false;
  }
}
