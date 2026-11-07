import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runBackup } from "./backup.js";
import { openDb, type DB } from "./db/migrate.js";
import * as repo from "./db/repo.js";
import { ingest } from "./ingest.js";
import { createInternalApp, createPublicApp, type Deps } from "./server.js";
import { addDays, monthOf, today } from "./time.js";
import { archiveMonthModel, homeModel } from "./viewmodels.js";

const INGEST = "ingest-secret";
const ADMIN = "admin-secret";

function setup(tokens: { ingestToken: string | undefined; adminToken: string | undefined } = { ingestToken: INGEST, adminToken: ADMIN }) {
  const db: DB = openDb(":memory:");
  const deps: Deps = { db, config: { ...tokens, publicUrl: "https://example.test" }, stylesCss: "body{}" };
  return { db, pub: createPublicApp(deps), internal: createInternalApp(deps) };
}

const daysAgo = (n: number, from = today()) => addDays(from, -n);

function item(over: Record<string, unknown> & { words?: string; ago?: number } = {}) {
  const { words = "example-tool", ago = 1, ...rest } = over;
  const date = daysAgo(ago);
  return {
    slug: `${date}-${words}`,
    date,
    kind: "news",
    title: `Title ${words}`,
    summary: "A summary.",
    why: "Why it matters.",
    how_to_try: null,
    heat: 3,
    links: [{ label: "Announcement", url: `https://example.com/${words}`, is_primary: true }],
    mentions: [],
    ...rest,
  };
}

const brief = (slugs: string[], headline = "The month in short") => ({
  headline,
  period_label: "Last 30 days",
  points: [1, 2, 3, 4, 5].map((n) => ({ title: `Point ${n}`, text: `Text ${n}.`, item_slugs: slugs })),
});

const result = (items: unknown[], b: unknown = null, rejected: unknown[] = [], startedAt = new Date()) => ({
  run: { started_at: startedAt.toISOString(), backend: "manual" },
  items,
  brief: b,
  rejected,
});

type App = { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
const post = (app: App, path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const count = (db: DB, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const runs = (db: DB) => repo.listRuns(db, 100);

describe("ingest", () => {
  it("writes only a failed run for a schema-invalid file", async () => {
    const { db, internal } = setup();
    const bad = result([item({ title: "x".repeat(91) })]);
    const res = await post(internal, "/api/internal/ingest", bad, INGEST);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: string[] };
    expect(body.errors.join()).toContain("items[0].title");
    expect(count(db, "items")).toBe(0);
    expect(count(db, "briefs")).toBe(0);
    expect(runs(db)).toHaveLength(1);
    expect(runs(db)[0]).toMatchObject({ status: "failed", backend: "manual" });
    expect(runs(db)[0]!.error).toContain("too long");
  });

  it("records a failed run for a body that is not JSON", async () => {
    const { db, internal } = setup();
    const res = await post(internal, "/api/internal/ingest", "{nope", INGEST);
    expect(res.status).toBe(400);
    expect(runs(db)[0]).toMatchObject({ status: "failed", backend: "unknown", error: "body is not valid JSON" });
  });

  it("a quiet night creates an ok run and leaves items and brief unchanged", async () => {
    const { db, internal } = setup();
    const it1 = item();
    expect((await post(internal, "/api/internal/ingest", result([it1], brief([it1.slug])), INGEST)).status).toBe(200);
    const before = { items: db.prepare("SELECT * FROM items").all(), briefs: db.prepare("SELECT * FROM briefs").all() };

    const res = await post(internal, "/api/internal/ingest", result([], null), INGEST);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ added: 0, updated: 0, rejected: 0 });
    expect(runs(db)[0]).toMatchObject({ status: "ok", items_added: 0 });
    expect(db.prepare("SELECT * FROM items").all()).toEqual(before.items);
    expect(db.prepare("SELECT * FROM briefs").all()).toEqual(before.briefs);
  });

  it("dedupes the same launch from Theo on X and from HN into one item", async () => {
    const { db, internal } = setup();
    const viaX = item({
      words: "acme-agent",
      heat: 4,
      links: [{ label: "Launch", url: "https://acme.dev/agent", is_primary: true }],
      mentions: [{ account_handle: "theo", source: "x", url: "https://x.com/theo/status/1" }],
    });
    const viaHn = item({
      words: "acme-agent-launch",
      heat: 3,
      title: "Acme ships an agent",
      links: [{ label: "Blog", url: "https://ACME.dev/agent/?utm_source=hn#top", is_primary: true }],
      mentions: [{ source: "hn", url: "https://news.ycombinator.com/item?id=42", metric: "640 points" }],
    });
    await post(internal, "/api/internal/ingest", result([viaX]), INGEST);
    const res = await post(internal, "/api/internal/ingest", result([viaHn]), INGEST);
    expect(await res.json()).toMatchObject({ added: 0, updated: 1 });

    const items = db.prepare("SELECT * FROM items").all() as repo.ItemRow[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ slug: viaX.slug, heat: 4, title: "Acme ships an agent" });
    expect(count(db, "item_links")).toBe(1);
    expect(repo.mentionsFor(db, [items[0]!.id]).map((m) => [m.source, m.account_handle, m.account_name])).toEqual([
      ["x", "theo", "Theo"],
      ["hn", null, null],
    ]);
  });

  it("dedupes within one payload and remaps brief slugs to the kept slug", () => {
    const db = openDb(":memory:");
    const a = item({ words: "foo", links: [{ label: "A", url: "https://foo.dev/", is_primary: true }] });
    const b = item({ words: "foo-two", heat: 5, links: [{ label: "B", url: "https://foo.dev", is_primary: true }] });
    const r = ingest(db, result([a, b], brief([b.slug])));
    expect(r.ok && r.response).toMatchObject({ added: 1, updated: 0 });
    expect(count(db, "items")).toBe(1);
    expect(repo.getItemBySlug(db, a.slug)?.heat).toBe(5);
    expect(repo.getLatestBrief(db)?.points[0]?.item_slugs).toEqual([a.slug]);
  });

  it("merges the same story sent twice in one payload by primary URL", () => {
    const db = openDb(":memory:");
    const viaX = item({
      words: "acme-agent",
      links: [{ label: "Launch", url: "https://acme.dev/agent", is_primary: true }],
      mentions: [{ account_handle: "theo", source: "x", url: "https://x.com/theo/status/1" }],
    });
    const viaHn = item({
      words: "acme-agent-launch",
      title: "Acme ships an agent",
      links: [{ label: "Blog", url: "https://acme.dev/agent?utm_source=hn", is_primary: true }],
      mentions: [{ source: "hn", url: "https://news.ycombinator.com/item?id=42" }],
    });
    const r = ingest(db, result([viaX, viaHn]));
    expect(r.ok && r.response).toMatchObject({ added: 1, updated: 0 });
    const items = db.prepare("SELECT * FROM items").all() as repo.ItemRow[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ slug: viaX.slug, title: "Acme ships an agent" });
    expect(count(db, "item_links")).toBe(1);
    expect(count(db, "item_mentions")).toBe(2);
  });

  it("never merges distinct items that share a mention URL, in one payload or across runs", () => {
    const db = openDb(":memory:");
    const thread = { source: "hn", url: "https://news.ycombinator.com/item?id=7" };
    const a = item({ words: "alpha", mentions: [thread] });
    const b = item({ words: "beta", mentions: [thread] });
    const c = item({ words: "gamma", mentions: [thread] });
    ingest(db, result([a, b]));
    ingest(db, result([c]));
    const titles = (db.prepare("SELECT title FROM items ORDER BY title").all() as { title: string }[]).map((r) => r.title);
    expect(titles).toEqual(["Title alpha", "Title beta", "Title gamma"]);
  });

  it("stores all 12 distinct items from the first-run seed", () => {
    const db = openDb(":memory:");
    const seed = JSON.parse(readFileSync(new URL("../../../seed/2026-11-04-first-run.json", import.meta.url), "utf8")) as {
      items: { slug: string; title: string }[];
    };
    const r = ingest(db, seed, { now: new Date("2026-11-04T12:00:00Z") });
    expect(r.ok && r.response).toMatchObject({ added: 12, updated: 0, rejected: 16 });
    expect(count(db, "items")).toBe(12);
    for (const s of seed.items) expect(repo.getItemBySlug(db, s.slug)?.title).toBe(s.title);
  });

  it("caps heat at 5, on insert and on merge", () => {
    const db = openDb(":memory:");
    ingest(db, result([item({ heat: 9 })]));
    expect(repo.getItemBySlug(db, item().slug)?.heat).toBe(5);
    ingest(db, result([item({ heat: 4 })]));
    expect(repo.getItemBySlug(db, item().slug)?.heat).toBe(5);
  });

  it("rejects items older than 30 days and marks the run partial", async () => {
    const { db, internal } = setup();
    const res = await post(internal, "/api/internal/ingest", result([item({ ago: 31, words: "old" }), item({ ago: 30 })], null, [{ title: "t", reason: "opinion thread" }]), INGEST);
    expect(await res.json()).toMatchObject({ added: 1, rejected: 2 });
    expect(runs(db)[0]).toMatchObject({ status: "partial", items_rejected: 2 });
    expect(runs(db)[0]!.error).toContain("older than 30 days");
    expect(repo.getItemBySlug(db, item({ ago: 31, words: "old" }).slug)).toBeUndefined();
  });

  it("home drops items older than 30 days but the archive keeps them", () => {
    const db = openDb(":memory:");
    const past = new Date(Date.now() - 40 * 86_400_000);
    const old = { ...item({ words: "old-thing" }), date: daysAgo(35), slug: `${daysAgo(35)}-old-thing` };
    expect(ingest(db, result([old], null, [], past), { now: past }).ok).toBe(true);
    ingest(db, result([item()]));

    const home = homeModel(db, { path: "/" });
    expect(home.days.flatMap((d) => d.items.map((i) => i.slug))).toEqual([item().slug]);
    const archive = archiveMonthModel(db, monthOf(old.date), "/archive");
    expect(archive?.days.flatMap((d) => d.items.map((i) => i.slug))).toContain(old.slug);
  });

  it("treats a brief citing an unknown slug as invalid", async () => {
    const { db, internal } = setup();
    const it1 = item();
    const res = await post(internal, "/api/internal/ingest", result([it1], brief([it1.slug, "2026-01-01-ghost"])), INGEST);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: string[] }).errors[0]).toContain("unknown item 2026-01-01-ghost");
    expect(count(db, "items")).toBe(0);
    expect(runs(db)[0]?.status).toBe("failed");

    // A slug already in the DB is a valid citation.
    await post(internal, "/api/internal/ingest", result([it1]), INGEST);
    expect((await post(internal, "/api/internal/ingest", result([], brief([it1.slug])), INGEST)).status).toBe(200);
    expect(count(db, "briefs")).toBe(1);
  });
});

describe("public site", () => {
  async function seeded() {
    const s = setup();
    const shown = item({ words: "shown", kind: "try", how_to_try: "npx shown", mentions: [{ account_handle: "theo", source: "x", url: "https://x.com/theo/status/9" }] });
    const hidden = item({ words: "hidden" });
    await post(s.internal, "/api/internal/ingest", result([shown, hidden], brief([shown.slug, hidden.slug])), INGEST);
    await post(s.pub, `/api/admin/items/${hidden.slug}/hide`, {}, ADMIN);
    return { ...s, shown, hidden };
  }

  it("excludes hidden items from home, item page, api, rss and brief", async () => {
    const { db, pub, shown, hidden } = await seeded();
    const home = homeModel(db, { path: "/" });
    expect(home.days.flatMap((d) => d.items.map((i) => i.slug))).toEqual([shown.slug]);
    expect(home.brief?.points[0]?.items).toEqual([{ slug: shown.slug, title: shown.title }]);
    expect((await pub.request(`/item/${hidden.slug}`)).status).toBe(404);
    expect((await pub.request(`/item/${shown.slug}`)).status).toBe(200);

    const api = (await (await pub.request("/api/items")).json()) as { items: { slug: string }[] };
    expect(api.items.map((i) => i.slug)).toEqual([shown.slug]);
    const rss = await (await pub.request("/rss.xml")).text();
    expect(rss).toContain(`<link>https://example.test/item/${shown.slug}</link>`);
    expect(rss).not.toContain(hidden.slug);
  });

  it("admin unhide brings an item back; admin needs the token", async () => {
    const { pub, hidden } = await seeded();
    expect((await post(pub, `/api/admin/items/${hidden.slug}/unhide`, {})).status).toBe(401);
    expect((await post(pub, `/api/admin/items/${hidden.slug}/unhide`, {}, "wrong")).status).toBe(401);
    const res = await post(pub, `/api/admin/items/${hidden.slug}/unhide`, {}, ADMIN);
    expect(await res.json()).toEqual({ slug: hidden.slug, status: "published" });
    expect((await pub.request(`/item/${hidden.slug}`)).status).toBe(200);
    expect((await post(pub, "/api/admin/items/2026-01-01-nope/hide", {}, ADMIN)).status).toBe(404);
  });

  it("filters home by kind and by handle", async () => {
    const { db, shown } = await seeded();
    const slugs = (q: { kind?: string; by?: string }) => homeModel(db, { path: "/", ...q }).days.flatMap((d) => d.items.map((i) => i.slug));
    expect(slugs({ kind: "try" })).toEqual([shown.slug]);
    expect(slugs({ kind: "news" })).toEqual([]);
    expect(slugs({ by: "@Theo" })).toEqual([shown.slug]);
    expect(slugs({ by: "poteto" })).toEqual([]);
    expect(homeModel(db, { path: "/" }).people.map((p) => p.handle)).toEqual(["poteto", "mattpocockuk", "theo"]);
    expect(homeModel(db, { path: "/" }).lastUpdated).not.toBeNull();
  });

  it("serves pages, feeds and health", async () => {
    const { pub, shown } = await seeded();
    for (const path of ["/", "/?kind=try&by=theo", "/archive", `/archive/${monthOf(shown.date)}`, "/sources", "/status", "/healthz", "/readyz"]) {
      expect((await pub.request(path)).status, path).toBe(200);
    }
    expect((await pub.request("/archive/1999-01")).status).toBe(404);
    expect((await pub.request("/nope")).status).toBe(404);
    expect((await pub.request("/styles.css")).headers.get("content-type")).toContain("text/css");
    expect((await pub.request("/api/brief")).status).toBe(200);
    expect((await pub.request("/api/items?since=bad")).status).toBe(400);
    expect((await pub.request(`/api/items?kind=news`)).status).toBe(200);
  });

  it("escapes XML in the RSS feed", async () => {
    const { pub, internal } = setup();
    await post(internal, "/api/internal/ingest", result([item({ title: `Tom & "Jerry" <b>` })]), INGEST);
    const rss = await (await pub.request("/rss.xml")).text();
    expect(rss).toContain("<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt;</title>");
  });

  it("admin can add and deactivate accounts", async () => {
    const { db, pub } = setup();
    expect((await post(pub, "/api/admin/accounts", { handle: "@NewPerson", active: true }, ADMIN)).status).toBe(400);
    const res = await post(pub, "/api/admin/accounts", { handle: "@NewPerson", name: "New", priority: "high", active: true }, ADMIN);
    expect(res.status).toBe(201);
    expect(repo.getAccount(db, "newperson")).toMatchObject({ name: "New", priority: "high", active: 1 });
    expect((await post(pub, "/api/admin/accounts", { handle: "theo", active: false }, ADMIN)).status).toBe(200);
    expect(repo.listAccounts(db).map((a) => a.handle)).not.toContain("theo");
    expect(repo.getAccount(db, "theo")?.name).toBe("Theo");
  });
});

describe("listeners and auth", () => {
  it("internal routes do not exist on the public app", async () => {
    const { pub } = setup();
    expect((await pub.request("/api/internal/state", { headers: { authorization: `Bearer ${INGEST}` } })).status).toBe(404);
    expect((await post(pub, "/api/internal/ingest", result([]), INGEST)).status).toBe(404);
  });

  it("public routes do not exist on the internal app", async () => {
    const { internal } = setup();
    expect((await internal.request("/")).status).toBe(404);
    expect((await post(internal, "/api/admin/items/x/hide", {}, ADMIN)).status).toBe(404);
  });

  it("internal routes require the bearer token", async () => {
    const { internal } = setup();
    expect((await internal.request("/api/internal/state")).status).toBe(401);
    expect((await internal.request("/api/internal/state", { headers: { authorization: "Bearer nope" } })).status).toBe(401);
    const res = await internal.request("/api/internal/state", { headers: { authorization: `Bearer ${INGEST}` } });
    expect(res.status).toBe(200);
    const state = (await res.json()) as { accounts: unknown[]; repos: { url: string }[]; last_success_at: unknown };
    expect(state.accounts).toHaveLength(12);
    expect(state.repos.map((r) => r.url)).toContain("https://github.com/t3dotgg/tstack");
    expect(state.last_success_at).toBeNull();
  });

  it("returns 503 when tokens are not configured", async () => {
    const { pub, internal } = setup({ ingestToken: undefined, adminToken: undefined });
    expect((await internal.request("/api/internal/state", { headers: { authorization: "Bearer x" } })).status).toBe(503);
    expect((await post(pub, "/api/admin/items/x/hide", {}, "x")).status).toBe(503);
  });

  it("records a failed run from the researcher", async () => {
    const { db, internal } = setup();
    expect((await post(internal, "/api/internal/runs/failed", { started_at: "nope" }, INGEST)).status).toBe(400);
    const res = await post(internal, "/api/internal/runs/failed", { started_at: new Date().toISOString(), backend: "api", error: "model timed out" }, INGEST);
    expect(res.status).toBe(201);
    expect(runs(db)[0]).toMatchObject({ status: "failed", backend: "api", error: "model timed out" });
  });
});

describe("backup", () => {
  it("copies the db and prunes copies older than 14 days", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "tu-data-"));
    const backupDir = join(mkdtempSync(join(tmpdir(), "tu-bak-")), "backups");
    const db = openDb(join(dataDir, "tech-update.db"));
    ingest(db, result([item()]));
    db.close();

    await runBackup({ dataDir, backupDir });
    const old = `tech-update-${daysAgo(15)}.db`;
    const recent = `tech-update-${daysAgo(14)}.db`;
    writeFileSync(join(backupDir, old), "");
    writeFileSync(join(backupDir, recent), "");
    const { file, deleted } = await runBackup({ dataDir, backupDir });

    expect(deleted).toEqual([old]);
    expect(readdirSync(backupDir).sort()).toEqual([recent, `tech-update-${today()}.db`].sort());
    const copy = new Database(file, { readonly: true });
    expect((copy.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n).toBe(1);
    copy.close();
  });

  it("fails when the database is missing", async () => {
    await expect(runBackup({ dataDir: mkdtempSync(join(tmpdir(), "tu-empty-")), backupDir: mkdtempSync(join(tmpdir(), "tu-bak-")) })).rejects.toThrow();
  });

  it("shows updates from followed people at the top, once each, and tells the researcher about them", async () => {
    const { db, pub, internal } = setup();
    const u = (over: Record<string, unknown> = {}) => ({
      account_handle: "mattpocockuk",
      date: daysAgo(1),
      source: "x",
      text: "Matt shared a new free lesson on writing skills for coding agents.",
      url: "https://x.com/mattpocockuk/status/1",
      ...over,
    });
    const first = ingest(db, {
      ...result([]),
      updates: [
        u(),
        u({ account_handle: "theo", text: "Theo posted a video about `t3 code`.", url: "https://youtube.com/watch?v=abc" }),
        u({ account_handle: "nobody", url: "https://x.com/nobody/status/9" }),
      ],
    });
    expect(first.ok && first.response.updates).toBe(2);
    const again = ingest(db, { ...result([]), updates: [u()] });
    expect(again.ok && again.response.updates).toBe(0);

    const html = await (await pub.request("/")).text();
    expect(html).toContain("From the people you follow");
    expect(html.indexOf("From the people you follow")).toBeLessThan(html.indexOf('id="brief-head"'));
    expect(html).toContain("Matt shared a new free lesson");
    expect(html).toContain("<code>t3 code</code>");
    expect(html).not.toContain("nobody");

    const state = (await (await internal.request("/api/internal/state", { headers: { authorization: `Bearer ${INGEST}` } })).json()) as {
      recent_updates: { url: string }[];
    };
    expect(state.recent_updates.map((r) => r.url)).toContain("https://x.com/mattpocockuk/status/1");
  });

  it("shows an empty people section before the first updates", async () => {
    const { pub } = setup();
    expect(await (await pub.request("/")).text()).toContain("Nothing from them in the last 7 days.");
  });
});
