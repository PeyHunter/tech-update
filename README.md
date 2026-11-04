# tech-update

**What changed in AI this month, and what you can try today.**
Live at [tech-update.peytonhunter.com](https://tech-update.peytonhunter.com).

Every night at 03:30 (Copenhagen) a research job reads what the AI world talked about, mainly on X and Hacker News. It checks each story against a primary source and adds it to the site. The site answers two questions:

1. What happened in AI in the last 30 days, and what are the most important points?
2. What new AI things can I try right now, and how?

It is also a small, complete example of a production service: typed end to end, tested, containerised, and deployed by GitOps to a k3s cluster.

## Architecture

```
                       Internet
                          │ HTTPS (Let's Encrypt via cert-manager)
                ┌─────────▼──────────┐
                │  Traefik Ingress   │  routes port 3000 only
                └─────────┬──────────┘
   namespace tech-update  │
   ┌──────────────────────▼───────────────────────┐
   │ Deployment web (1 replica, Hono + SQLite)    │
   │   :3000  pages, RSS, JSON API, admin         │◄── PVC data (/data/tech-update.db)
   │   :3001  internal: state, ingest, runs       │
   └──────────────────────▲───────────────────────┘
                          │ bearer INGEST_TOKEN, NetworkPolicy: researcher → web:3001 only
   ┌──────────────────────┴───────────────────────┐
   │ CronJob researcher (03:30, Forbid, 40 min)   │
   │   1. GET state   2. claude -p PROMPT.md       │
   │   3. validate result.json (zod)   4. POST    │
   └──────────────────────────────────────────────┘
   CronJob backup (04:30): SQLite .backup → PVC backups, keeps 14 days

  git push ─► GitHub Actions: test → build web + researcher images → ghcr.io
            ─► commit new tags to deploy/kustomization.yaml ─► Argo CD syncs deploy/
```

The ingest API listens on its own port. The Ingress never routes that port, so the public internet can't reach it at all, even with a leaked token.

## Repository

| Path | What |
|---|---|
| `packages/shared` | Zod schema for `result.json`. One source of truth for the web app and the researcher. |
| `apps/web` | Hono server, SQLite (better-sqlite3), server-rendered pages with `hono/jsx`, RSS, JSON API, admin, backup entrypoint. |
| `apps/researcher` | `PROMPT.md` (the research instructions) and a TypeScript wrapper. It runs Claude Code headless, or the Anthropic API with `RESEARCHER_BACKEND=api`, then validates and sends the result. |
| `deploy/` | Kustomize manifests, synced by Argo CD. |
| `docs/` | [SPEC.md](docs/SPEC.md) (the product) and [design.md](docs/design.md) (the build contract). |

## How a night works

1. The researcher fetches `/api/internal/state`: items from the last 30 days and the watch list.
2. Claude Code runs with only WebSearch, WebFetch, Read and Write, confined to its output folder. It searches each watch-list account, Hacker News, GitHub, lab blogs and newsletters. It keeps only `news` and `try` items with a primary source and writes `result.json`.
3. The wrapper validates the file. An invalid file is recorded as a failed run, and nothing else is written.
4. The web app merges the run in one transaction. A story found twice (say Theo on X and a Hacker News thread) becomes one item with two mentions. Heat is capped at 5, items older than 30 days are rejected, and the monthly brief may only cite items that exist.
5. Every run, good or bad, shows up on [/status](https://tech-update.peytonhunter.com/status).

## Run it locally

```sh
npm ci
npm run build
npm test

# web on :3000 (public) and :3001 (internal)
DATA_DIR=./data INGEST_TOKEN=dev ADMIN_TOKEN=dev npm start -w @tech-update/web

# send a result file without running the model
WEB_INTERNAL_URL=http://localhost:3001 INGEST_TOKEN=dev \
  node apps/researcher/dist/run.js --file sample.json
```

## Operate it

```sh
# start a research run now
kubectl -n tech-update create job --from=cronjob/researcher manual-$(date +%s)

# hide a wrong item (ADMIN_TOKEN is in Secret tech-update-tokens)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://tech-update.peytonhunter.com/api/admin/items/<slug>/hide
```

The researcher logs in with a token from `claude setup-token`, stored as the sealed Secret `researcher-auth` (`CLAUDE_CODE_OAUTH_TOKEN`). See [apps/researcher/README.md](apps/researcher/README.md).

## Choices

- **SQLite, one replica.** Tiny data and a single writer. Nothing extra to run, and a backup is one file. The Deployment uses `Recreate`, so two pods never write at once.
- **Server-rendered HTML, no client JS.** The home page is a few kilobytes and loads in under 100 ms locally.
- **One schema package.** The researcher and the web app validate with the same zod schema, so they can't drift apart.
- **The model can't touch the cluster.** It has no shell, no service account token, and a NetworkPolicy that only allows the internet and the web app's internal port.
