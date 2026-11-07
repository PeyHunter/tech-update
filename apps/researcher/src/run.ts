import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseResultFile, type FailedRunRequest, type IngestResponse, type StateResponse } from "@tech-update/shared";
import { backendName, createBackend, type Backend, type BackendName } from "./backends/index.js";

const DAY_MS = 86_400_000;
const PROMPT_PATH = fileURLToPath(new URL("../PROMPT.md", import.meta.url));

export function lookbackDays(lastSuccessAt: string | null, now: Date): number {
  if (!lastSuccessAt) return 30;
  const days = Math.ceil((now.getTime() - new Date(lastSuccessAt).getTime()) / DAY_MS);
  return Math.min(3, Math.max(1, Number.isFinite(days) ? days : 3));
}

export function copenhagenToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);
}

export type Deps = {
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => Date;
  backend?: (name: BackendName) => Backend;
  log: (line: string) => void;
};

type Args = { file: string | null; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { file: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--file" && argv[i + 1]) args.file = argv[++i]!;
    else throw new Error(`unknown argument ${argv[i]} (use --file <path> and/or --dry-run)`);
  }
  return args;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

/** Returns the process exit code. */
export async function main(argv: string[], deps: Deps): Promise<number> {
  const { env, log } = deps;
  const startedAt = deps.now().toISOString();
  let backend = "manual";
  let posting = false;

  const api = async (path: string, init?: { body: unknown }) => {
    const base = required(env, "WEB_INTERNAL_URL").replace(/\/+$/, "");
    return deps.fetch(`${base}${path}`, {
      method: init ? "POST" : "GET",
      headers: { authorization: `Bearer ${required(env, "INGEST_TOKEN")}`, "content-type": "application/json" },
      body: init ? JSON.stringify(init.body) : undefined,
    });
  };

  const reportFailed = async (error: string) => {
    if (!posting) return;
    const body: FailedRunRequest = { started_at: startedAt, backend, error: error.slice(0, 2000) };
    try {
      const res = await api("/api/internal/runs/failed", { body });
      if (!res.ok) log(`could not record failed run: HTTP ${res.status}`);
    } catch (err) {
      log(`could not record failed run: ${(err as Error).message}`);
    }
  };

  try {
    const args = parseArgs(argv);
    posting = !args.dryRun;
    let raw: unknown;

    if (args.file) {
      // A seed file is sent as written, including its own run.started_at and run.backend.
      raw = JSON.parse(await readFile(args.file, "utf8"));
      const run = (raw as { run?: { started_at?: unknown; backend?: unknown } })?.run;
      if (typeof run?.backend === "string") backend = run.backend;
    } else {
      const name = backendName(env.RESEARCHER_BACKEND);
      backend = name;
      const outDir = resolve(env.OUT_DIR || "/out");
      await mkdir(outDir, { recursive: true });

      const res = await api("/api/internal/state");
      if (!res.ok) throw new Error(`GET /api/internal/state: HTTP ${res.status}`);
      const state = (await res.json()) as StateResponse;
      const now = deps.now();
      const statePath = join(outDir, "state.json");
      await writeFile(
        statePath,
        JSON.stringify({ ...state, today: copenhagenToday(now), lookback_days: lookbackDays(state.last_success_at, now) }, null, 2),
      );

      const { notes } = await (deps.backend ?? ((n) => createBackend(n, env)))(name).run({
        outDir,
        promptPath: PROMPT_PATH,
        statePath,
      });

      const resultPath = join(outDir, "result.json");
      let text: string;
      try {
        text = await readFile(resultPath, "utf8");
      } catch {
        throw new Error(`backend finished but ${resultPath} was not written`);
      }
      raw = JSON.parse(text);
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const r = raw as { run?: Record<string, unknown> };
        const prev = r.run && typeof r.run === "object" ? r.run : {};
        const prevNotes = typeof prev.notes === "string" && prev.notes ? `${prev.notes} ` : "";
        r.run = { ...prev, started_at: startedAt, backend: name, notes: `${prevNotes}${notes}`.trim() };
      }
    }

    const parsed = parseResultFile(raw);
    if (!parsed.ok) {
      log(`invalid result.json:\n  ${parsed.errors.join("\n  ")}`);
      await reportFailed(`invalid result.json: ${parsed.errors.join("; ")}`);
      return 1;
    }
    const v = parsed.value;
    if (args.dryRun) {
      log(`dry run: valid, ${v.items.length} items, ${v.rejected.length} rejected, brief ${v.brief ? `with ${v.brief.points.length} points` : "null"}. Nothing sent.`);
      return 0;
    }

    const res = await api("/api/internal/ingest", { body: v });
    if (!res.ok) {
      log(`ingest failed: HTTP ${res.status} ${(await res.text()).slice(0, 1000)}`);
      // On 400 the web records the failed run itself.
      if (res.status !== 400) await reportFailed(`ingest HTTP ${res.status}`);
      return 1;
    }
    const out = (await res.json()) as IngestResponse;
    log(`ingested run ${out.run_id}: ${out.added} added, ${out.updated} updated, ${out.rejected} rejected, ${out.updates ?? 0} people updates`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`researcher failed: ${message}`);
    await reportFailed(message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2), {
    env: process.env,
    fetch: globalThis.fetch,
    now: () => new Date(),
    log: (line) => console.log(line),
  }).then((code) => process.exit(code));
}
