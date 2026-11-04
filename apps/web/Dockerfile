# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/web/Dockerfile .

# better-sqlite3 may compile from source, so the install stages get a toolchain. The runtime image does not.
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# Every workspace manifest, so npm ci sees a lockfile in sync with the workspace list.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/researcher/package.json apps/researcher/

FROM base AS build
RUN npm ci -w @tech-update/web -w @tech-update/shared
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @tech-update/shared && npm run build -w @tech-update/web

FROM base AS deps
# The mkdirs let the runtime stage copy workspace node_modules even when npm hoisted everything.
RUN npm ci --omit=dev -w @tech-update/web -w @tech-update/shared \
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
USER node
EXPOSE 3000 3001
CMD ["node", "dist/main.js"]
