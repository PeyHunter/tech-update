# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/web/Dockerfile .

FROM node:24-bookworm-slim AS base
WORKDIR /app
# Every workspace manifest, so npm ci sees a lockfile in sync with the workspace list.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/researcher/package.json apps/researcher/

# --ignore-scripts: shared's prepare would run tsc before the sources are here, and better-sqlite3
# needs no install script because it ships N-API prebuilds (the root allowScripts denies it too).
FROM base AS build
RUN npm ci --ignore-scripts -w @tech-update/web -w @tech-update/shared
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @tech-update/shared && npm run build -w @tech-update/web

FROM base AS deps
# The mkdirs let the runtime stage copy workspace node_modules even when npm hoisted everything.
RUN npm ci --ignore-scripts --omit=dev -w @tech-update/web -w @tech-update/shared \
 && mkdir -p packages/shared/node_modules apps/web/node_modules

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/package.json ./
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/shared/package.json packages/shared/
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=deps /app/apps/web/package.json apps/web/
COPY --from=deps /app/apps/web/node_modules apps/web/node_modules
COPY --from=build /app/apps/web/dist apps/web/dist
# The backup CronJob runs `node dist/backup.js` from here.
WORKDIR /app/apps/web
# Fail the build, not the pod, if the native SQLite binding cannot load on this platform.
RUN node -e "require('better-sqlite3')(':memory:').prepare('select 1').get()"
USER node
EXPOSE 3000 3001
CMD ["node", "dist/main.js"]
