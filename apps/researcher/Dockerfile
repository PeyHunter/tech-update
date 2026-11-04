# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/researcher/Dockerfile .

FROM node:24-bookworm-slim AS base
WORKDIR /app
# Every workspace manifest, so npm ci sees a lockfile in sync with the workspace list.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/researcher/package.json apps/researcher/

FROM base AS build
RUN npm ci -w @tech-update/researcher -w @tech-update/shared
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/researcher apps/researcher
RUN npm run build -w @tech-update/shared && npm run build -w @tech-update/researcher

FROM base AS deps
# The mkdirs let the runtime stage copy workspace node_modules even when npm hoisted everything.
RUN npm ci --omit=dev -w @tech-update/researcher -w @tech-update/shared \
 && mkdir -p packages/shared/node_modules apps/researcher/node_modules

FROM node:24-bookworm-slim
ARG CLAUDE_CODE_VERSION=latest
ENV NODE_ENV=production \
    DISABLE_AUTOUPDATER=1
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" && npm cache clean --force
WORKDIR /app
COPY --from=deps /app/package.json ./
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/shared/package.json packages/shared/
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=deps /app/apps/researcher/package.json apps/researcher/
COPY --from=deps /app/apps/researcher/node_modules apps/researcher/node_modules
COPY --from=build /app/apps/researcher/dist apps/researcher/dist
COPY apps/researcher/PROMPT.md apps/researcher/
WORKDIR /app/apps/researcher
USER node
CMD ["node", "dist/run.js"]
