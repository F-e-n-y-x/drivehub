# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# DriveHub — multi-stage build.
# Stage 1 installs deps + builds all workspaces. better-sqlite3 is a native
# module, so the build stage has python/make/g++ available via the base image's
# build toolchain. Stage 2 is a lean runtime with only production artifacts.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
# Toolchain for native module compilation (better-sqlite3).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
# Copy manifests first for better layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json .npmrc ./
COPY packages/types/package.json packages/types/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile || pnpm install

# Copy sources and build types -> web -> server.
COPY . .
RUN pnpm --filter @drivehub/types build \
  && pnpm --filter @drivehub/web build \
  && pnpm --filter @drivehub/server build

# Produce a pruned production node_modules for the server + its deps.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @drivehub/server deploy --prod /export/server

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HUB_PATH=/data/sync
ENV DATA_DIR=/data/app
ENV WEB_DIST=/app/web
# Runtime user/group ids. Override to match host ownership, or set 0 to run as
# root (needed to read root-owned source data such as system AppData).
ENV PUID=10001
ENV PGID=10001
# Stamped at build time so the app can report its version / check for updates.
ARG APP_VERSION=0.1.0
ENV APP_VERSION=$APP_VERSION
# Git commit the image was built from — used to detect when a rolling "main"
# image is behind the latest commit.
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA
WORKDIR /app

# gosu drops privileges after the entrypoint fixes mount permissions.
# Storage engine = rclone-extra (a community rclone fork: all official backends
# PLUS native terabox/teldrive/alldebrid). unzip/ca-certificates fetch it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu ca-certificates unzip curl bash \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 10001 --create-home --shell /usr/sbin/nologin drivehub \
  && ARCH="$(dpkg --print-architecture)" \
  && case "$ARCH" in \
       amd64) RCLONE_ARCH=amd64; TTYD_ARCH=x86_64 ;; \
       arm64) RCLONE_ARCH=arm64; TTYD_ARCH=aarch64 ;; \
       *) RCLONE_ARCH="$ARCH"; TTYD_ARCH="$ARCH" ;; \
     esac \
  && curl -fsSL "https://github.com/gulp79/rclone-extra/releases/latest/download/rclone-linux-${RCLONE_ARCH}.zip" -o /tmp/rclone.zip \
  && unzip -o /tmp/rclone.zip -d /tmp/rclone-x \
  && cp "$(find /tmp/rclone-x -type f -name rclone | head -n1)" /usr/local/bin/rclone \
  && rm -rf /tmp/rclone-x \
  && chmod +x /usr/local/bin/rclone \
  && rm /tmp/rclone.zip \
  && rclone version \
  # Bundle ttyd for the optional built-in web terminal (ENABLE_TERMINAL=true).
  && curl -fsSL "https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.${TTYD_ARCH}" -o /usr/local/bin/ttyd \
  && chmod +x /usr/local/bin/ttyd \
  && (ttyd --version || echo "ttyd bundle skipped")

# Server runtime (code + pruned prod deps) and the built web assets.
COPY --from=build /export/server/dist ./dist
COPY --from=build /export/server/node_modules ./node_modules
COPY --from=build /export/server/package.json ./package.json
COPY --from=build /repo/packages/web/dist ./web
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN mkdir -p /data/sync /data/app \
  && chown -R drivehub:drivehub /app /data \
  && chmod +x /usr/local/bin/entrypoint.sh

# NOTE: we intentionally stay root here; entrypoint.sh fixes mount ownership
# and then drops to PUID:PGID via gosu.
EXPOSE 8080
VOLUME ["/data/sync", "/data/app"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
