#!/bin/sh
# DriveHub container entrypoint.
#
# Bind-mounted host folders arrive owned by the host's user, so a fixed
# non-root image user often can't write them (the SQLITE_CANTOPEN you hit).
# We start as root, make the data dir writable by the chosen UID/GID, then
# drop privileges with gosu. Set PUID=0/PGID=0 if you need to read root-owned
# source data (e.g. system AppData).
set -e

PUID="${PUID:-10001}"
PGID="${PGID:-10001}"

mkdir -p /data/sync /data/app

# Make app data (DB + encrypted tokens) writable by the runtime user.
# Best-effort: never fail startup just because chown can't change a mount.
chown -R "${PUID}:${PGID}" /data/app 2>/dev/null || true
# Only the top of the sync folder — it may be huge, and we must not rewrite
# ownership of the user's files. If source data is root-owned, run with PUID=0.
chown "${PUID}:${PGID}" /data/sync 2>/dev/null || true

if [ "$(id -u)" = "0" ]; then
  exec gosu "${PUID}:${PGID}" "$@"
fi
exec "$@"
