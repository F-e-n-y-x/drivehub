import { google, type Auth } from "googleapis";
import type { AppConfig } from "../config.js";

type OAuth2Client = Auth.OAuth2Client;

/**
 * Google OAuth helper. In v2 its job is to obtain a token we can hand to
 * rclone (which then owns the Drive connection). We request offline access so
 * the token includes a refresh_token.
 */

export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function makeOAuthClient(config: AppConfig): OAuth2Client {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.oauthRedirectUri,
  );
}

export function authUrl(config: AppConfig, state: string): string {
  const client = makeOAuthClient(config);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: OAUTH_SCOPES,
    include_granted_scopes: true,
    state,
  });
}

export interface DriveConnection {
  email: string;
  name: string | null;
  /** rclone-compatible token JSON string. */
  rcloneTokenJson: string;
}

/** Exchange an auth code and return the identity + an rclone token JSON. */
export async function exchangeCodeForRclone(
  config: AppConfig,
  code: string,
): Promise<DriveConnection> {
  const client = makeOAuthClient(config);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Remove DriveHub at myaccount.google.com/permissions and reconnect.",
    );
  }
  client.setCredentials(tokens);

  let email = "google-account";
  let name: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    email = data.email ?? email;
    name = data.name ?? null;
  } catch {
    /* identity is best-effort */
  }

  const rcloneTokenJson = JSON.stringify({
    access_token: tokens.access_token,
    token_type: tokens.token_type ?? "Bearer",
    refresh_token: tokens.refresh_token,
    expiry: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : new Date(Date.now() + 3600_000).toISOString(),
  });

  return { email, name, rcloneTokenJson };
}
