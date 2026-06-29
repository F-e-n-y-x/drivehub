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

---

# Connecting other storage

Most backends need **no setup file at all** — you enter their keys in the UI
under **Remotes → Add remote**.

- **Local / NAS / USB** — pick a folder with the built-in directory browser.
- **S3 / MinIO / Wasabi, Backblaze B2** — paste access key + secret (+ endpoint
  for non-AWS).
- **WebDAV / Nextcloud, SMB / CIFS, SFTP** — host + credentials.

**Dropbox / OneDrive** — these use OAuth without a redirect, so you connect by
pasting a token:
1. On any computer with a browser, install rclone and run
   `rclone authorize "dropbox"` (or `rclone authorize "onedrive"`).
2. Complete the sign-in; rclone prints a token JSON.
3. In DriveHub: **Add remote → Dropbox/OneDrive → paste the token**.

**iCloud Drive (experimental)** — **Add remote → iCloud**, enter your Apple ID
and **primary** password (not an app-specific password), then enter the 6-digit
**2FA code** Apple sends to your devices. Note: Apple's trust tokens expire and
may need a periodic reconnect; accounts with Advanced Data Protection aren't
supported.

**Teldrive (Telegram storage)** — run your own
[Teldrive](https://github.com/tgdrive/teldrive) server, then **Add remote →
Teldrive (Telegram)**: enter its API host and the `user_session` token (from the
Teldrive web UI → DevTools → Application → Cookies). Native backend via
rclone-extra.

**AllDebrid** — create an API key in your AllDebrid account (Apikeys panel), then
**Add remote → AllDebrid** and paste it. DriveHub connects to AllDebrid's WebDAV
media folder for you.

**Anything else (pCloud, Mega, Koofr, Storj, Box, Yandex…)** — use
**Add remote → Custom / other (advanced)**: enter the rclone backend name plus
its config keys.

> **Smooth video preview.** For cloud remotes, DriveHub streams previews through
> an on-demand `rclone serve http` with a VFS read cache, so large videos seek
> instantly and re-watch from cache instead of re-downloading. The cache lives at
> `/data/app/vfs-cache` (capped, auto-pruned); the server is started on first use
> and reaped when idle. (TeraBox stays on the direct path — its backend downloads
> are unreliable regardless.)

## TeraBox

TeraBox is **built in** — DriveHub's image bundles
[rclone-extra](https://github.com/gulp79/rclone-extra) (a community rclone fork
with a native `terabox` backend), so it works with no AList needed.

1. Get your **cookie**: sign in at terabox.com, open DevTools (F12) → Network →
   click any request → copy the full **`Cookie`** request header (it must
   include `ndus=…`).
2. In DriveHub: **Add remote → TeraBox** → paste the cookie → Add.

That's it — TeraBox appears as a normal remote you can browse.

Caveat: TeraBox has no official API, so this relies on an **unofficial** backend.
Browsing and **uploads** work; **downloads/streaming are unreliable** (so
previewing TeraBox videos may fail). The cookie also expires periodically (just
re-add it). For reliable TeraBox **reading**, run your own
[AList](https://alist.nn.ci)/OpenList server and connect it via
**Add remote → AList / OpenList** (WebDAV URL).

> Note: the bundled rclone is the **rclone-extra** community fork (a superset of
> official rclone — all standard backends plus terabox/teldrive/alldebrid). To
> use stock rclone instead, mount your own binary and set `RCLONE_BIN`.
