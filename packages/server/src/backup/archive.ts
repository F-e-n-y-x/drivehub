import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";

/**
 * Create a gzip-compressed tar archive of `sourceDir` at `outFile`.
 * Returns the archive size in bytes. Uses node-tar (pure JS, cross-platform).
 */
export async function createTarGz(
  sourceDir: string,
  outFile: string,
  gzipLevel: number,
): Promise<number> {
  await mkdir(path.dirname(outFile), { recursive: true });
  const cwd = path.dirname(sourceDir);
  const entry = path.basename(sourceDir);
  await tar.create(
    {
      gzip: { level: clampLevel(gzipLevel) },
      file: outFile,
      cwd,
      portable: true,
      // Keep going if a file disappears mid-archive (live data).
      noDirRecurse: false,
    },
    [entry],
  );
  return (await stat(outFile)).size;
}

function clampLevel(n: number): number {
  if (Number.isNaN(n)) return 6;
  return Math.min(9, Math.max(0, Math.floor(n)));
}
