import type { AppConfig } from "../config.js";
import { decryptSecret } from "../crypto.js";
import type { SyncRepo } from "../db/repo.js";
import { DriveClient } from "../google/drive.js";
import { clientFromRefreshToken } from "../google/oauth.js";

type AccountRow = ReturnType<SyncRepo["getAccount"]> extends infer T ? T : never;

/**
 * Lazily builds and caches one DriveClient per account. The refresh token is
 * decrypted only in memory here and never leaves this module.
 */
export class AccountRegistry {
  private clients = new Map<string, DriveClient>();

  constructor(
    private readonly config: AppConfig,
    private readonly repo: SyncRepo,
  ) {}

  /** Active (non-paused, non-errored) accounts the engine should sync. */
  activeAccounts(): NonNullable<AccountRow>[] {
    return this.repo
      .listAccounts()
      .filter((a) => a.status === "active") as NonNullable<AccountRow>[];
  }

  client(accountId: string): DriveClient {
    const cached = this.clients.get(accountId);
    if (cached) return cached;
    const account = this.repo.getAccount(accountId);
    if (!account) throw new Error(`Unknown account: ${accountId}`);
    const refreshToken = decryptSecret(
      account.refreshTokenEnc,
      this.config.TOKEN_ENCRYPTION_KEY,
    );
    const auth = clientFromRefreshToken(this.config, refreshToken);
    const client = new DriveClient(auth);
    this.clients.set(accountId, client);
    return client;
  }

  invalidate(accountId: string): void {
    this.clients.delete(accountId);
  }
}
