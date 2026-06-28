import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * MD5 of a file's contents. We use MD5 specifically because Google Drive
 * exposes `md5Checksum` for binary files, letting us compare local and remote
 * content cheaply without re-downloading. (MD5 here is a content fingerprint,
 * not a security primitive.)
 */
export function md5File(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("md5");
    const stream = createReadStream(absPath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function md5Buffer(buf: Buffer | string): string {
  return createHash("md5").update(buf).digest("hex");
}
