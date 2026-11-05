import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createClaudeCodeBackend } from "./backends/claude-code.js";
import type { Backend } from "./backends/index.js";
import { copenhagenToday, lookbackDays, main, type Deps } from "./run.js";

const NOW = new Date("2026-11-04T02:30:00Z");

function validResult() {
  const slug = "2026-11-02-example-tool";
  return {
    run: { started_at: "2026-11-04T00:00:00Z", backend: "claude-code", notes: "checked HN" },
    items: [
      {
        slug,
        date: "2026-11-02",
        kind: "try",
        title: "Example tool ships",
        summary: "A short summary.",
        why: "Why it matters.",
        how_to_try: "npm i example",
        heat: 4,
        links: [{ label: "Announcement", url: "https://example.com/post", is_primary: true }],
        mentions: [],
      },
    ],
    brief: {
      headline: "The month",
      period_label: "6 Oct – 4 Nov 2026",
      points: Array.from({ length: 5 }, () => ({ title: "A point", text: "Text.", item_slugs: [slug] })),
    },
    rejected: [],
  };
}

type Call = { url: string; method: string; body: unknown };

function setup(result: unknown, opts: { ingestStatus?: number } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    if (call.url.endsWith("/api/internal/state")) {
      return Response.json({ last_success_at: "2026-11-03T02:40:00Z", items: [], accounts: [] });
    }
    if (call.url.endsWith("/api/internal/ingest")) {
      return Response.json({ run_id: 7, added: 1, updated: 0, rejected: 0 }, { status: opts.ingestStatus ?? 200 });
    }
    return Response.json({ ok: true });
  });
  const backend: Backend = {
    async run({ outDir }) {
      await writeFile(join(outDir, "result.json"), JSON.stringify(result));
      return { notes: "backend notes" };
    },
  };
  return async (argv: string[] = []) => {
    const outDir = await mkdtemp(join(tmpdir(), "researcher-"));
    const lines: string[] = [];
    const deps: Deps = {
      env: { WEB_INTERNAL_URL: "http://web:3001", INGEST_TOKEN: "secret-token", OUT_DIR: outDir, RESEARCHER_BACKEND: "claude-code" },
      fetch: fetchMock as unknown as typeof fetch,
      now: () => NOW,
      backend: () => backend,
      log: (l) => lines.push(l),
    };
    const code = await main(argv, deps);
    return { code, calls, lines, outDir };
  };
}

describe("lookbackDays", () => {
  it("is 30 on the first run", () => expect(lookbackDays(null, NOW)).toBe(30));
  it("rounds up and clamps to 1..3", () => {
    expect(lookbackDays("2026-11-04T02:00:00Z", NOW)).toBe(1);
    expect(lookbackDays("2026-11-02T03:00:00Z", NOW)).toBe(2);
    expect(lookbackDays("2026-10-01T00:00:00Z", NOW)).toBe(3);
    expect(lookbackDays("2026-11-05T00:00:00Z", NOW)).toBe(1);
  });
  it("uses the Copenhagen date", () => expect(copenhagenToday(new Date("2026-11-03T23:30:00Z"))).toBe("2026-11-04"));
});

describe("main", () => {
  it("writes state.json, overwrites run.started_at/backend, appends notes, and ingests", async () => {
    const { code, calls, lines, outDir } = await setup(validResult())();
    expect(code).toBe(0);
    const state = JSON.parse(await readFile(join(outDir, "state.json"), "utf8"));
    expect(state).toMatchObject({ today: "2026-11-04", lookback_days: 1 });
    const ingest = calls.find((c) => c.url.endsWith("/ingest"))!;
    expect(ingest.body).toMatchObject({
      run: { started_at: NOW.toISOString(), backend: "claude-code", notes: "checked HN backend notes" },
    });
    expect(lines.join("\n")).toContain("1 added, 0 updated, 0 rejected");
    expect(lines.join("\n")).not.toContain("secret-token");
  });

  it("reports an invalid result to runs/failed and never ingests", async () => {
    const bad = { ...validResult(), items: [{ ...validResult().items[0], heat: 1 }] };
    const { code, calls } = await setup(bad)();
    expect(code).toBe(1);
    expect(calls.some((c) => c.url.endsWith("/ingest"))).toBe(false);
    const failed = calls.find((c) => c.url.endsWith("/runs/failed"))!;
    expect(failed.body).toMatchObject({ started_at: NOW.toISOString(), backend: "claude-code" });
    expect((failed.body as { error: string }).error).toContain("items[0].heat");
  });

  it("--dry-run --file validates and sends nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "researcher-"));
    const good = join(dir, "good.json");
    const bad = join(dir, "bad.json");
    await writeFile(good, JSON.stringify(validResult()));
    await writeFile(bad, JSON.stringify({ ...validResult(), brief: { headline: "x", period_label: "y", points: [] } }));
    const ok = await setup(null)(["--dry-run", "--file", good]);
    expect(ok.code).toBe(0);
    const ko = await setup(null)(["--dry-run", "--file", bad]);
    expect(ko.code).toBe(1);
    expect([...ok.calls, ...ko.calls]).toEqual([]);
  });

  it("exits 1 on a non-2xx ingest", async () => {
    const { code } = await setup(validResult(), { ingestStatus: 400 })();
    expect(code).toBe(1);
  });
});

describe("claude-code backend", () => {
  it("fails fast without a token", async () => {
    const spawn = vi.fn();
    const backend = createClaudeCodeBackend({}, spawn as never);
    await expect(backend.run({ outDir: "/tmp", promptPath: "/nope", statePath: "/nope" })).rejects.toThrow(
      /CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY/,
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
