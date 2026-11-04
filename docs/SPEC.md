# ai-update — specification

Status: draft 1, 2026-11-02. Owner: Peyton. Built as **tech-update** (see [design.md](design.md)).

## 1. What it is

ai-update is a website that explains what is new in AI. Every night an AI researcher job reads what the AI world talked about that day, mainly on X, and adds it to the site. The site always answers two questions:

1. What happened in AI in the last 30 days, and what are the most important points?
2. What new AI things can I try right now, and how?

It runs on Peyton's k3s cluster. It is also a portfolio project, so the code, the deploy setup and the README should be clean enough to show an employer.

## 2. Who it is for

- Peyton, first. A developer and datamatiker student who wants to stay current without reading X all day.
- Visitors (employers, classmates) who open the link. The site is public and read-only.

## 3. What goes on the site

Only two kinds of item. Everything else is filtered out.

| Kind | Meaning | Must include |
|---|---|---|
| news | A release, launch, model, research result, policy or deal that people in AI are talking about. | What happened, why it matters, a primary source. |
| try | A tool, model, app, feature, repo or technique you can use today. | A concrete first step ("npx x init", "free at site.com, sign in and…"). |

Never on the site: opinion threads, drama, personal fights, funding news with no product, crypto, "AI will replace X" takes, rumours with no source, anything older than 30 days.

Popularity ("heat"), 1 to 5:

| Heat | Meaning |
|---|---|
| 5 | Everyone in AI is talking about it (top of X and HN at once). |
| 4 | Big on X or HN, several watch-list accounts posted about it. |
| 3 | Notable, one strong signal. |
| 2 | Niche but useful, often a try item. |
| 1 | Small. Not published. |

## 4. Pages

All pages are server-rendered HTML, fast, readable on a phone, light and dark theme.

### 4.1 Home /

1. Header: name, one-line description, "last updated" time from the last successful run.
2. The month in short: a headline sentence, then 5 to 7 numbered points. Each point is 2–3 sentences: what happened, why it matters, what to try. Points link to the items they are based on.
3. Filter: All / News / Try it, plus a filter per watch-list person ("Theo", "Matt Pocock", "Lauren").
4. Item list for the last 30 days, grouped by day, newest first, highest heat first within a day. Each item shows: kind label, heat meter, title, summary, why it matters, how to try (for try), who was talking about it (watch-list avatars/handles), links.

### 4.2 Item /item/:slug

Full item with all links and the accounts that posted about it. Shareable URL.

### 4.3 Archive /archive/:yyyy-mm

Each month's brief stays readable after the month ends. Items older than 30 days leave the home page but stay in the archive (they are not deleted).

### 4.4 Sources /sources

The watch list (section 6) and the other sources, so a visitor knows where the information comes from.

### 4.5 Status /status

Last 14 runs: start time, duration, items added, items rejected, errors. One glance shows whether the nightly job works.

### 4.6 Feeds

- `/rss.xml` — new items, so Peyton can follow it in a feed reader.
- `/api/items?since=YYYY-MM-DD&kind=try` and `/api/brief` — JSON, read-only.

### 4.7 Health

- `/healthz` — process is up (liveness).
- `/readyz` — database is reachable (readiness).

## 5. The nightly research job

### 5.1 When

Kubernetes CronJob, every night at 03:30 Europe/Copenhagen (`spec.timeZone`). `concurrencyPolicy: Forbid`, so two runs never overlap. Can also be started by hand:
`kubectl -n tech-update create job --from=cronjob/researcher manual-$(date +%s)`.

### 5.2 Steps

1. Read state: `GET /api/internal/state` from the web service: items from the last 30 days (titles, links, slugs) and the time of the last successful run. Used to skip duplicates.
2. Research (section 6), looking back to the last successful run, at most 3 days. First run looks back 30 days.
3. Verify: every kept item has at least one primary source (the lab's post, the repo, the paper, the product page). No invented links, numbers or dates.
4. Score and filter: assign kind and heat, drop heat 1 and everything on the "never" list.
5. Merge: if an item already exists, update its heat and add new mentions instead of creating a duplicate.
6. Rewrite the monthly brief from all items of the last 30 days.
7. Write a result file `/out/result.json` (schema in section 8.3).
8. Validate and send: a small wrapper script checks the file against the schema and POSTs it to `/api/internal/ingest` with a bearer token. Invalid output means the run fails and nothing is written.
9. Report: the run is recorded (section 8.1) whether it succeeded or not.

Aim: 5–12 new items per night. Fewer is fine on a quiet day.

### 5.3 How the AI part runs

Recommended: Claude Code, headless, on Peyton's subscription.
- Container image with Node and `@anthropic-ai/claude-code`, plus the research instructions (`researcher/PROMPT.md`).
- Auth with a long-lived token made by `claude setup-token`, stored as a Kubernetes Secret, passed as `CLAUDE_CODE_OAUTH_TOKEN`.
- Command: `claude -p "$(cat PROMPT.md)" --allowedTools "WebSearch WebFetch Write Read" --output-format json`.
- Only tools it needs: web search, web fetch, and writing `/out/result.json`. No shell, no cluster access.
- Check Anthropic's current terms for automated personal use of a subscription before going live.

Fallback: Anthropic API. Same prompt, the Messages API with the web search tool, an API key in a Secret. Costs money per run (billed separately from the subscription). Switch with one env var: `RESEARCHER_BACKEND=claude-code|api`.

Limits per run: max 40 minutes (`activeDeadlineSeconds: 2400`), no retries on the same night (`backoffLimit: 0`), so a broken run can't burn the usage limit.

## 6. Sources

### 6.1 X watch list

Priority accounts are checked every night. A post from one of them counts as a strong signal (+1 heat, capped at 5).

| Priority | Account | Who |
|---|---|---|
| High | @poteto | Lauren. Grok at SpaceX/xAI, React compiler core, ex-Cursor/Meta/Netflix |
| High | @mattpocockuk | Matt Pocock. TypeScript and AI teacher (AI Hero) |
| High | @theo | Theo. T3 Code, T3 Chat, YouTube |
| Normal | @thdxr | dax. opencode |
| Normal | @thsottiaux | Tibo. Codex and ChatGPT at OpenAI |
| Normal | @alexandr_wang | Alexandr Wang. Meta Superintelligence Labs |
| Normal | @davis7 | Ben Davis. Nerd Snipe podcast |
| Normal | @vojta_holik | Vojta Holik. Design engineering |
| Normal | @tobi | Tobi Lütke. Shopify |
| Normal | @kevinroose | Kevin Roose. Tech journalist, Machine Gods podcast |
| Normal | @CaseyNewton | Casey Newton. Platformer, Machine Gods podcast |
| Normal | @ezraklein | Ezra Klein. NYT, AI-policy and culture interviews |

The list lives in the database (accounts table), not in code, so accounts can be added without a deploy.

### 6.2 How X is read

X cannot be read reliably for free. The job uses the best source it has and records which one it used:

1. Web search for each account's recent posts (`site:x.com/<handle>`). Free, finds some posts, can miss posts or be a few days late.
2. The same people outside X, which are easy to read: Theo's YouTube channel, Matt Pocock's AI Hero newsletter and blog, the Nerd Snipe and Machine Gods podcasts, Platformer, the opencode GitHub repo.
3. X API (optional, later): the reliable option, but paid. Behind a feature flag `X_API_ENABLED`, with the bearer token in a Secret. Check current pricing first.

### 6.3 Other sources (for popularity and confirmation)

- Hacker News front page and AI stories with 150+ points (Algolia API).
- GitHub trending (AI repos only).
- Hugging Face daily papers, arXiv.
- AI lab news pages: Anthropic, OpenAI, Google DeepMind, Meta AI, Mistral, xAI, DeepSeek, Qwen, Hugging Face.
- Newsletters that sum up X: The Rundown AI, Ben's Bites, TLDR AI, Latent Space.

## 7. Architecture on k3s

```
                 Internet
                    │
        Traefik Ingress (k3s default) + TLS
                    │
   ┌────────────────▼─────────────────┐
   │ Deployment: web (1 replica)      │  pages, RSS, JSON API, ingest API
   │ owns SQLite on a PVC             │
   └────────────────▲─────────────────┘
                    │ POST /api/internal/ingest (ClusterIP, bearer token)
   ┌────────────────┴─────────────────┐
   │ CronJob: researcher (03:30)      │  Claude Code headless → result.json → validate → POST
   └──────────────────────────────────┘
```

| Resource | Details |
|---|---|
| Namespace | tech-update |
| Deployment/web | 1 replica (SQLite is single-writer). Requests 50m CPU / 128Mi, limit 256Mi. Liveness /healthz, readiness /readyz. Runs as non-root, read-only root filesystem. |
| Service/web | ClusterIP, port 80 → 3000. |
| Ingress/web | Traefik, host tech-update.peytonhunter.com, TLS by cert-manager. /api/internal/* is not routed by the ingress, so it is only reachable inside the cluster. |
| PersistentVolumeClaim/data | 1Gi, local-path (k3s default), mounted at /data. |
| CronJob/researcher | Schedule `30 3 * * *`, timeZone Europe/Copenhagen, concurrencyPolicy Forbid, backoffLimit 0, activeDeadlineSeconds 2400, successfulJobsHistoryLimit 3, failedJobsHistoryLimit 5. Requests 200m / 512Mi. |
| Secret/researcher | CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY), INGEST_TOKEN, optional X_BEARER_TOKEN. |
| Secret/web | INGEST_TOKEN, ADMIN_TOKEN. |
| NetworkPolicy | researcher may reach the internet and web only. |
| Backups | CronJob/backup once a day: sqlite .backup to a second volume, keep 14 days. |

Deploy: GitHub repo tech-update. GitHub Actions builds two images (web, researcher) to GHCR on every push to main, tagged with the commit SHA. Manifests in deploy/ (plain YAML with Kustomize). Argo CD syncs the folder.

## 8. Data

### 8.1 Tables (SQLite)

- **items**: id, slug (unique, YYYY-MM-DD-short-title), date (when it happened or went viral), kind (news|try), title, summary, why, how_to_try (nullable), heat (2–5), status (published|hidden), created_at, updated_at, run_id.
- **item_links**: item_id, label, url, is_primary.
- **item_mentions**: item_id, account_handle (nullable), source (x|hn|github|arxiv|lab|newsletter|youtube), url, metric (e.g. "640 points"), seen_at.
- **briefs**: month (YYYY-MM), headline, points (JSON array of {title, text, item_slugs[]}), period_label, updated_at, run_id.
- **accounts**: handle, name, description, priority (high|normal), active.
- **runs**: id, started_at, finished_at, status (ok|failed|partial), backend, items_added, items_updated, items_rejected, error, notes.

### 8.2 Rules

- A slug is never reused. Re-finding an item updates it.
- Items are never deleted by the job. Peyton can set status=hidden (section 9).
- A run's writes go in one transaction: all or nothing.

### 8.3 result.json (what the researcher sends)

```json
{
  "run": { "started_at": "…", "backend": "claude-code", "notes": "…" },
  "items": [
    {
      "slug": "2026-11-02-example-tool",
      "date": "2026-11-02",
      "kind": "try",
      "title": "…",
      "summary": "…",
      "why": "…",
      "how_to_try": "…",
      "heat": 4,
      "links": [{ "label": "Announcement", "url": "https://…", "is_primary": true }],
      "mentions": [{ "account_handle": "theo", "source": "x", "url": "https://x.com/…" }]
    }
  ],
  "brief": {
    "headline": "…",
    "period_label": "3 Oct – 2 Nov 2026",
    "points": [{ "title": "…", "text": "…", "item_slugs": ["…"] }]
  },
  "rejected": [{ "title": "…", "reason": "opinion thread" }]
}
```

Validation: title ≤ 90 chars, summary ≤ 300, every item has a primary link with https://, try items have how_to_try, every brief point cites at least one item, 5–7 points.

## 9. Admin (Peyton only)

No login page. A few endpoints protected by ADMIN_TOKEN, used from the terminal:
- `POST /api/admin/items/:slug/hide` and `/unhide` — remove a wrong item from the site.
- `POST /api/admin/accounts` — add or deactivate a watch-list account.
- Start a run by hand with the kubectl create job command in 5.1.

## 10. Writing style on the site

Plain English. Short sentences. No hype words ("revolutionary", "game-changer"). Say what it is, then why it matters. Numbers only when a source states them. Same rules for the monthly brief.

## 11. Quality checks (definition of done)

- A night with no news still produces a run row, an unchanged site and no errors.
- A broken result file never reaches the database.
- Duplicates: the same launch reported by Theo on X and on HN is one item with two mentions.
- The home page loads in under 1 second on a phone and has no horizontal scroll.
- Killing the web pod loses no data (PVC), and the site is back within 30 seconds.
- Tests: schema validation, dedupe/merge, 30-day window, heat cap, brief cites real items.

## 12. Tech choices

| Part | Choice | Why |
|---|---|---|
| Web | TypeScript, Node 24 LTS, Hono, server-rendered HTML | Small, fast, one language, easy to read in a portfolio. |
| DB | SQLite (better-sqlite3) on a PVC | One writer, tiny data, nothing extra to run. Move to Postgres only if it grows. |
| Researcher | Claude Code CLI in a Node container + a TypeScript wrapper (validate + POST) | Uses the subscription. Same schema code as the web app. |
| Validation | Zod, shared package used by both images | One source of truth for result.json. |
| Build/deploy | GitHub Actions → GHCR → Kustomize on k3s via Argo CD | Standard and easy to explain. |

## 13. Not in version 1

User accounts, comments, email newsletter, a search box, multiple languages, images/thumbnails, scraping X directly.

## 14. Milestones

1. Skeleton: repo, web app, Dockerfile, k3s manifests, live on the cluster with TLS.
2. Database + ingest API: tables, /api/internal/ingest, validation, run rows, /status.
3. Researcher: container, prompt, wrapper, CronJob. One manual run fills the site with the last 30 days.
4. Polish: archive, RSS, item pages, per-person filter, backups, README with an architecture diagram.
5. Optional: X API behind the feature flag.

## 15. Answers (2026-11-04)

1. Cluster: k3s on a VPS (k3s-1, control plane) plus a worker (k3s-2). cert-manager with a `letsencrypt` ClusterIssuer, external-dns on Cloudflare, Sealed Secrets, and Argo CD app-of-apps from PeyHunter/k3s-gitops are already installed.
2. Domain: tech-update.peytonhunter.com.
3. Public, read-only.
4. Backend: Claude Code on the subscription by default; API as fallback via `RESEARCHER_BACKEND`.
5. Registry: GHCR.
