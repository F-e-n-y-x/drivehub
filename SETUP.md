# Google OAuth setup (optional)

> **Only needed for one-click Google Drive sign-in.** Every other backend —
> Local/NAS/USB, S3, B2, WebDAV, SFTP — is configured directly in the web UI and
> needs none of this. Dropbox and OneDrive can be added by pasting a token from
> `rclone authorize "dropbox"` / `rclone authorize "onedrive"`.

DriveHub connects to Google Drive using **your own** Google Cloud OAuth client.
This keeps you in full control — no third-party servers ever see your data or
tokens. The one-time setup takes about 5 minutes.

> You only do this once. Afterwards you can connect as many Google accounts as
> you like from the DriveHub UI.

---

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/>.
2. Click the project picker (top bar) → **New Project**.
3. Name it e.g. `DriveHub` and click **Create**. Select it.

## 2. Enable the Google Drive API

1. Open <https://console.cloud.google.com/apis/library/drive.googleapis.com>.
2. Make sure your project is selected, then click **Enable**.

## 3. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** and click **Create**.
3. Fill in the required fields:
   - **App name**: `DriveHub`
   - **User support email**: your email
   - **Developer contact email**: your email
4. **Scopes**: you can leave this empty here — DriveHub requests the scopes it
   needs at sign-in time (`drive`, `userinfo.email`, `userinfo.profile`).
5. **Test users**: click **Add Users** and add **every Google account** you plan
   to connect (including your own). In testing mode only these accounts can sign
   in — which is exactly what you want for a private, self-hosted instance.
6. Save. **Leave the app in "Testing" — do not publish.** Testing mode is
   indefinite for personal use and avoids Google's verification review.

## 4. Create the OAuth client credentials

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. **Application type**: **Web application**.
4. **Name**: `DriveHub Web`.
5. Under **Authorized redirect URIs**, add **exactly** your app URL + the callback
   path:

   | Where you run DriveHub | Authorized redirect URI |
   |---|---|
   | Local machine | `http://localhost:8080/api/oauth/google/callback` |
   | A server / domain | `https://drive.example.com/api/oauth/google/callback` |

   > This must match `PUBLIC_URL` in your `.env`. If `PUBLIC_URL` is
   > `https://drive.example.com`, the redirect URI is
   > `https://drive.example.com/api/oauth/google/callback`.

6. Click **Create**. Copy the **Client ID** and **Client secret**.

## 5. Put the credentials in `.env`

```dotenv
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
TOKEN_ENCRYPTION_KEY=<run: openssl rand -base64 32>
PUBLIC_URL=http://localhost:8080
```

## 6. Start DriveHub and connect

```bash
docker compose up -d
```

Open your `PUBLIC_URL`, click **Connect Google Account**, choose the account
(it must be in your test-users list), and approve the consent screen. Repeat for
each account you want to keep in sync.

---

## Troubleshooting

**"Access blocked: app not verified" / "app is in testing"**
Add the Google account to **Test users** (step 3.5). Testing-mode apps only allow
listed test users.

**"redirect_uri_mismatch"**
The redirect URI in Google Cloud must match `<PUBLIC_URL>/api/oauth/google/callback`
character-for-character (scheme, host, port, path). Update whichever is wrong.

**"Google did not return a refresh token"**
This happens if the app was previously authorized. DriveHub forces
`prompt=consent`, but if it persists, remove DriveHub from
<https://myaccount.google.com/permissions> and reconnect.

**Behind a reverse proxy / HTTPS**
Set `PUBLIC_URL` to your external HTTPS URL and use that same host in the
Authorized redirect URI. Make sure the proxy forwards `/api/events` without
buffering so the live activity feed (SSE) streams.
