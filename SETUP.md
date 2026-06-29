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

**Anything else (pCloud, Mega, Koofr, Storj, Box, Yandex…)** — use
**Add remote → Custom / other (advanced)**: enter the rclone backend name plus
its config keys.

## TeraBox

TeraBox has **no official API and no native rclone backend**, so DriveHub can't
connect it directly. Two working options:

**Option A — AList as a WebDAV bridge (recommended; no rclone fork).**
[AList](https://alist.nn.ci) is a small self-hosted gateway that *can* speak
TeraBox and re-expose it over standard WebDAV — which official rclone (and
therefore DriveHub) understands.
1. Run AList (e.g. alongside DriveHub):
   ```yaml
   services:
     alist:
       image: xhofe/alist:latest
       container_name: alist
       restart: unless-stopped
       ports: ["5244:5244"]
       volumes: ["./alist:/opt/alist/data"]
   ```
   Get the admin password with `docker exec -it alist ./alist admin`.
2. In AList (`http://<host>:5244`): **Manage → Storage → Add → Terabox**, sign in.
3. AList serves WebDAV at `http://<host>:5244/dav` (your AList username/password).
4. In DriveHub: **Add remote → WebDAV / Nextcloud** → URL `http://<host>:5244/dav`,
   your AList user + pass. Browse/sync TeraBox like any other remote.

**Option B — a TeraBox-capable rclone fork (`rclone-extra`).**
[rclone-extra](https://github.com/gulp79/rclone-extra) is a fork that ships
prebuilt binaries and adds a native `terabox` backend (cookie-based).

1. Download the binary for your container's architecture from the
   [releases](https://github.com/gulp79/rclone-extra/releases) (e.g.
   `linux-amd64` or `linux-arm64`), name it `rclone-extra`, and put it on the
   host, e.g. `./bin/rclone-extra` (make it executable: `chmod +x`).
2. Mount it into the container and select it. In your compose/stack add:
   ```yaml
       volumes:
         - ./bin/rclone-extra:/usr/local/bin/rclone-extra:ro
       environment:
         RCLONE_BIN: /usr/local/bin/rclone-extra
   ```
3. Get your TeraBox **cookie**: sign in at terabox.com, open DevTools (F12) →
   Network → any request → copy the full `Cookie` request header.
4. In DriveHub: **Add remote → Custom / other (advanced)**, backend `terabox`,
   add a config key `cookie` = the full cookie string.

Caveats: this is unofficial; the cookie expires periodically (re-paste when it
does), and it can break when TeraBox changes. DriveHub ships official rclone and
does not
bundle forks.
