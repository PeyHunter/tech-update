# tech-update design

The product spec is [SPEC.md](SPEC.md). This file is the build contract: names, shapes, and who owns which files.

Name: the spec calls it ai-update. The repo, namespace, images and domain are `tech-update`. Site title: **tech-update**.

## Layout (npm workspaces, TypeScript, ESM, Node 24 LTS)

```
packages/shared/      @tech-update/shared   zod schema for result.json, types, rules. Used by web and researcher.
apps/web/             @tech-update/web      Hono server, SQLite, pages, APIs.
  src/db/             schema.sql, migrate.ts, repo.ts (all SQL lives here)
  src/ingest.ts       validate + merge + write one run in one transaction
  src/server.ts       two listeners: public :3000, internal :3001
  src/routes/         public.ts, api.ts, internal.ts, admin.ts, rss.ts
  src/views/          pure render functions (hono/jsx), styles.css
  src/time.ts         "today" and the 30-day window, Europe/Copenhagen
apps/researcher/      @tech-update/researcher
  PROMPT.md           research instructions for the model
  src/run.ts          wrapper: get state, run backend, validate, POST, report failure
  src/backends/       claude-code.ts, api.ts  (RESEARCHER_BACKEND=claude-code|api)
deploy/               Kustomize: base manifests for namespace tech-update
.github/workflows/    ci.yml: test, build 2 images to GHCR, bump tags in k3s-gitops
```

## Shared schema (packages/shared/src/index.ts)

```ts
export const KINDS = ["news", "try"] as const;
export const SOURCES = ["x", "hn", "github", "arxiv", "lab", "newsletter", "youtube"] as const;
export const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const linkSchema      // { label: string 1..60, url: https:// url, is_primary: boolean }
export const mentionSchema   // { account_handle?: string|null (no @, lowercase), source: Source, url: https url, metric?: string|null }
export const itemSchema      // { slug, date: YYYY-MM-DD, kind, title ≤90, summary ≤300, why ≤400, how_to_try: string|null,
                             //   heat: int ≥2, clamped to 5 by transform, links ≥1, mentions ≥0 }
                             //   refine: ≥1 link with is_primary && https; kind=try ⇒ how_to_try non-empty;
                             //           slug date prefix === date
export const briefPointSchema // { title ≤90, text ≤600, item_slugs: string[] ≥1 }
export const briefSchema     // { headline ≤160, period_label, points: 5..7 }
export const resultFileSchema // { run: { started_at: ISO datetime, backend: "claude-code"|"api"|"manual", notes?: string },
                              //   items: Item[] (unique slugs), brief: Brief | null, rejected: {title, reason}[] }
export type ResultFile = z.infer<typeof resultFileSchema>; // and Item, Link, Mention, Brief, BriefPoint, Kind, Source
export function parseResultFile(json: unknown): { ok: true; value: ResultFile } | { ok: false; errors: string[] };

export type StateResponse = {            // GET /api/internal/state
  last_success_at: string | null;        // ISO
  items: { slug: string; title: string; date: string; urls: string[] }[];  // last 30 days
  accounts: { handle: string; name: string; description: string; priority: "high" | "normal" }[]; // active only
};
export type IngestResponse = { run_id: number; added: number; updated: number; rejected: number };
export type FailedRunRequest = { started_at: string; backend: string; error: string };  // POST /api/internal/runs/failed
```

`brief: null` means a quiet night: keep the current brief.

## Database (SQLite, better-sqlite3, WAL, file `$DATA_DIR/tech-update.db`)

Tables exactly as SPEC §8.1. Additions: `item_links` and `item_mentions` have `UNIQUE(item_id, url)`; `briefs.month` is the primary key (YYYY-MM of the run date, Europe/Copenhagen). `accounts` is seeded with the 12 accounts in SPEC §6.1 by the first migration. Migrations are numbered SQL in `src/db/migrations/`, tracked with `PRAGMA user_version`.

## Ingest rules (apps/web/src/ingest.ts), one transaction per run

1. `parseResultFile`. Invalid → 400 with errors, and a `runs` row with status `failed`. Nothing else written.
2. Each brief point's `item_slugs` must exist in this payload or in the DB. Otherwise → invalid (same as 1).
3. Items whose `date` is older than 30 days (Copenhagen) go to rejected with reason `older than 30 days`.
4. Match an existing item by slug, else by any shared normalized link URL (lowercase host, no trailing slash, no `utm_*`, no hash), else by mention URL. Match → update: `heat = min(5, max(old, new))`, add links/mentions not yet present, refresh text fields, keep the old slug. No match → insert.
5. Upsert brief for the month. Insert `runs` row: status `ok` (or `partial` if any rejected-for-age), counts.
6. Items are never deleted. `status=hidden` items are excluded from every public page and API.

## Routes

Public listener :3000 (the Ingress routes only this port):
- `GET /` home. Query `?kind=news|try` and `?by=<handle>`.
- `GET /item/:slug`, `GET /archive` (month list), `GET /archive/:yyyy-mm`, `GET /sources`, `GET /status`
- `GET /rss.xml`, `GET /api/items?since=YYYY-MM-DD&kind=`, `GET /api/brief`
- `GET /healthz` (always 200), `GET /readyz` (200 if `SELECT 1` works)
- `POST /api/admin/items/:slug/hide|unhide`, `POST /api/admin/accounts` (`{handle, name?, description?, priority?, active}`), bearer `ADMIN_TOKEN`
- `GET /styles.css`

Internal listener :3001 (Service port `internal`, never in the Ingress), bearer `INGEST_TOKEN`:
- `GET /api/internal/state`, `POST /api/internal/ingest`, `POST /api/internal/runs/failed`

## View models (apps/web/src/views/types.ts), the seam between data and pages

```ts
export type ItemView = { slug; date; kind; title; summary; why; how_to_try: string|null; heat: 2|3|4|5;
  links: {label; url; is_primary}[]; mentions: {account_handle: string|null; account_name: string|null; source; url; metric: string|null}[] };
export type BriefView = { month; headline; period_label; points: {title; text; items: {slug; title}[]}[]; updated_at };
export type RunView = { id; started_at; finished_at: string|null; duration_s: number|null; status; backend; items_added; items_updated; items_rejected; error: string|null };
export type AccountView = { handle; name; description; priority: "high"|"normal" };
export type Layout = { title: string; lastUpdated: string|null; path: string };
export type HomeModel = Layout & { brief: BriefView|null; days: { date: string; items: ItemView[] }[];
  filter: { kind: "all"|"news"|"try"; by: string|null }; people: AccountView[] /* high priority */ };
export type ItemModel = Layout & { item: ItemView };
export type ArchiveIndexModel = Layout & { months: { month: string; count: number }[] };
export type ArchiveMonthModel = Layout & { month: string; brief: BriefView|null; days: HomeModel["days"] };
export type SourcesModel = Layout & { accounts: AccountView[] };
export type StatusModel = Layout & { runs: RunView[] };
// views/index.ts exports: renderHome, renderItem, renderArchiveIndex, renderArchiveMonth, renderSources, renderStatus, renderNotFound
// each (model) => string (full HTML document)
```

## Env

web: `PORT=3000`, `INTERNAL_PORT=3001`, `DATA_DIR=/data`, `INGEST_TOKEN`, `ADMIN_TOKEN`, `PUBLIC_URL=https://tech-update.peytonhunter.com`.
researcher: `WEB_INTERNAL_URL=http://web.tech-update.svc:3001`, `INGEST_TOKEN`, `RESEARCHER_BACKEND`, `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, `OUT_DIR=/out`, `X_API_ENABLED=false`.
