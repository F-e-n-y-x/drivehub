import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { google, type drive_v3, type Auth } from "googleapis";

type OAuth2Client = Auth.OAuth2Client;

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  md5: string | null;
  size: number | null;
  modifiedTime: string | null;
  parents: string[];
  trashed: boolean;
  iconLink?: string | null;
}

export interface DriveAbout {
  email: string | null;
  name: string | null;
  picture: string | null;
  quotaUsed: number | null;
  quotaTotal: number | null;
}

function mapFile(f: drive_v3.Schema$File): DriveFile {
  return {
    id: f.id!,
    name: f.name ?? "",
    mimeType: f.mimeType ?? "",
    isFolder: f.mimeType === FOLDER_MIME,
    md5: f.md5Checksum ?? null,
    size: f.size != null ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ?? null,
    parents: f.parents ?? [],
    trashed: f.trashed ?? false,
    iconLink: f.iconLink ?? null,
  };
}

const FILE_FIELDS =
  "id, name, mimeType, md5Checksum, size, modifiedTime, parents, trashed, iconLink";

/**
 * Thin, purpose-built wrapper over the Drive v3 API. One instance per account.
 * It intentionally exposes only what the sync engine and viewer need.
 */
export class DriveClient {
  private readonly drive: drive_v3.Drive;

  constructor(auth: OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth });
  }

  async about(): Promise<DriveAbout> {
    const { data } = await this.drive.about.get({
      fields: "user(displayName,emailAddress,photoLink), storageQuota(limit,usage)",
    });
    const q = data.storageQuota;
    return {
      email: data.user?.emailAddress ?? null,
      name: data.user?.displayName ?? null,
      picture: data.user?.photoLink ?? null,
      quotaUsed: q?.usage != null ? Number(q.usage) : null,
      quotaTotal: q?.limit != null ? Number(q.limit) : null,
    };
  }

  /** Resolve the real folder id for "root" (My Drive). */
  async resolveRootId(folderId: string): Promise<string> {
    if (folderId && folderId !== "root") return folderId;
    const { data } = await this.drive.files.get({
      fileId: "root",
      fields: "id, name",
    });
    return data.id!;
  }

  async getFile(fileId: string): Promise<DriveFile | null> {
    try {
      const { data } = await this.drive.files.get({
        fileId,
        fields: FILE_FIELDS,
      });
      return mapFile(data);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /** List non-trashed children of a folder (handles pagination). */
  async listChildren(folderId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: `nextPageToken, files(${FILE_FIELDS})`,
        pageSize: 1000,
        pageToken,
        supportsAllDrives: false,
      });
      for (const f of data.files ?? []) out.push(mapFile(f));
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  /** Find a direct child folder/file by name under a parent. */
  async findChild(parentId: string, name: string): Promise<DriveFile | null> {
    const escaped = name.replace(/'/g, "\\'");
    const { data } = await this.drive.files.list({
      q: `'${parentId}' in parents and name = '${escaped}' and trashed = false`,
      fields: `files(${FILE_FIELDS})`,
      pageSize: 1,
    });
    const f = data.files?.[0];
    return f ? mapFile(f) : null;
  }

  async createFolder(parentId: string, name: string): Promise<DriveFile> {
    const { data } = await this.drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: FILE_FIELDS,
    });
    return mapFile(data);
  }

  /** Upload (create or update) a file. Uses resumable upload for large files. */
  async uploadFile(opts: {
    parentId: string;
    name: string;
    localPath: string;
    existingFileId?: string | null;
    mimeType?: string;
  }): Promise<DriveFile> {
    const media = {
      mimeType: opts.mimeType ?? "application/octet-stream",
      body: createReadStream(opts.localPath),
    };
    if (opts.existingFileId) {
      const { data } = await this.drive.files.update({
        fileId: opts.existingFileId,
        media,
        requestBody: { name: opts.name },
        fields: FILE_FIELDS,
      });
      return mapFile(data);
    }
    const { data } = await this.drive.files.create({
      requestBody: { name: opts.name, parents: [opts.parentId] },
      media,
      fields: FILE_FIELDS,
    });
    return mapFile(data);
  }

  async downloadFile(fileId: string, destPath: string): Promise<void> {
    const res = await this.drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
    );
    await pipeline(res.data as NodeJS.ReadableStream, createWriteStream(destPath));
  }

  /** Move a file to trash (recoverable) rather than hard-deleting. */
  async trashFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.update({
        fileId,
        requestBody: { trashed: true },
      });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  // ----- Changes feed (delta polling) -------------------------------------
  async getStartPageToken(): Promise<string> {
    const { data } = await this.drive.changes.getStartPageToken();
    return data.startPageToken!;
  }

  async listChanges(pageToken: string): Promise<{
    changes: Array<{ fileId: string; removed: boolean; file: DriveFile | null }>;
    newStartPageToken: string | null;
    nextPageToken: string | null;
  }> {
    const { data } = await this.drive.changes.list({
      pageToken,
      fields: `newStartPageToken, nextPageToken, changes(fileId, removed, file(${FILE_FIELDS}))`,
      pageSize: 200,
      includeRemoved: true,
      restrictToMyDrive: true,
    });
    const changes = (data.changes ?? []).map((c) => ({
      fileId: c.fileId!,
      removed: c.removed ?? false,
      file: c.file ? mapFile(c.file) : null,
    }));
    return {
      changes,
      newStartPageToken: data.newStartPageToken ?? null,
      nextPageToken: data.nextPageToken ?? null,
    };
  }
}

export function isNotFound(err: unknown): boolean {
  const code = (err as { code?: number; status?: number })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  return code === 404;
}

export function isRateLimited(err: unknown): boolean {
  const code = (err as { code?: number })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  return code === 403 || code === 429;
}

export { FOLDER_MIME };
