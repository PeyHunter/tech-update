# @tech-update/researcher

The nightly research job (SPEC §5). `node dist/run.js`:

1. `GET $WEB_INTERNAL_URL/api/internal/state` and write `$OUT_DIR/state.json` with `today` (Europe/Copenhagen) and `lookback_days` (days since the last good run, rounded up, 1 to 3; 30 on the first run).
2. Run the backend picked by `RESEARCHER_BACKEND`. It follows [PROMPT.md](PROMPT.md) and leaves `$OUT_DIR/result.json`.
3. Set `run.started_at` and `run.backend` to the real values, add the backend's notes to `run.notes`, and validate with `parseResultFile`.
4. Valid: `POST /api/internal/ingest`. Invalid, or anything throws: `POST /api/internal/runs/failed`, exit 1.

## Backends

- `claude-code` (default): Claude Code headless on the subscription. Runs, with no shell, in `$OUT_DIR`:
  `claude -p <PROMPT.md> --tools WebSearch,WebFetch,Write,Read --allowedTools "WebSearch WebFetch Write Read" --permission-mode dontAsk --restricted --strict-mcp-config --no-session-persistence --output-format json`.
  Only those four tools exist, anything else is denied without a prompt, and `--restricted` keeps Read/Write inside `$OUT_DIR`. Killed after 35 minutes.
- `api`: the Messages API with server-side `web_search` and `web_fetch`. Costs money per run. The model replies with result.json as text and the wrapper writes the file.

## Env

| Var | Needed for | Notes |
|---|---|---|
| `WEB_INTERNAL_URL` | all but `--dry-run --file` | `http://web.tech-update.svc:3001` in the cluster |
| `INGEST_TOKEN` | all but `--dry-run --file` | bearer for `/api/internal/*`; never printed |
| `RESEARCHER_BACKEND` | | `claude-code` (default) or `api` |
| `OUT_DIR` | | default `/out` |
| `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` | `claude-code` | Secret `researcher-auth` |
| `ANTHROPIC_API_KEY` | `api` | Secret `researcher-auth` |
| `RESEARCHER_MODEL` | `api` | default `claude-opus-5-5` |
| `CLAUDE_BIN` | | default `claude` |

## Run locally

```sh
npm run build -w @tech-update/shared && npm run build -w @tech-update/researcher
cd apps/researcher

# Check a result.json without sending it
node dist/run.js --dry-run --file ./result.json

# Send an existing result.json (manual seeding). Its run block is sent as written, e.g. backend "manual".
WEB_INTERNAL_URL=http://localhost:3001 INGEST_TOKEN=... node dist/run.js --file ./result.json

# Full run against a local web, without posting the result
WEB_INTERNAL_URL=http://localhost:3001 INGEST_TOKEN=... OUT_DIR=/tmp/out node dist/run.js --dry-run
```

## Auth for the cluster

Make a long-lived token with `claude setup-token`, then seal it as Secret `researcher-auth` in namespace `tech-update` with key `CLAUDE_CODE_OAUTH_TOKEN` (add `ANTHROPIC_API_KEY` too if you want the `api` backend).

## Start a run by hand

```sh
kubectl -n tech-update create job --from=cronjob/researcher manual-$(date +%s)
kubectl -n tech-update logs -f job/manual-<id>
```
