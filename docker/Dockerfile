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
WORKDIR /app

# Non-root runtime user.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin drivehub

# Server runtime (code + pruned prod deps) and the built web assets.
COPY --from=build /export/server/dist ./dist
COPY --from=build /export/server/node_modules ./node_modules
COPY --from=build /export/server/package.json ./package.json
COPY --from=build /repo/packages/web/dist ./web

RUN mkdir -p /data/sync /data/app && chown -R drivehub:drivehub /app /data
USER drivehub

EXPOSE 8080
VOLUME ["/data/sync", "/data/app"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
