import { google, type Auth } from "googleapis";
import type { AppConfig } from "../config.js";

type OAuth2Client = Auth.OAuth2Client;

/**
 * Google OAuth 2.0 helpers. We request offline access so we receive a refresh
 * token (stored encrypted) and can mint access tokens indefinitely without the
 * operator re-consenting.
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

export interface ConnectedIdentity {
  email: string;
  name: string | null;
  picture: string | null;
  refreshToken: string;
}

/** Exchange an authorization code for tokens and the user's identity. */
export async function exchangeCode(
  config: AppConfig,
  code: string,
): Promise<ConnectedIdentity> {
  const client = makeOAuthClient(config);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke the app's access in your Google account and reconnect (we force prompt=consent to avoid this).",
    );
  }
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return {
    email: data.email ?? "unknown",
    name: data.name ?? null,
    picture: data.picture ?? null,
    refreshToken: tokens.refresh_token,
  };
}

/** Build an authorized client for an account from its stored refresh token. */
export function clientFromRefreshToken(
  config: AppConfig,
  refreshToken: string,
): OAuth2Client {
  const client = makeOAuthClient(config);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
