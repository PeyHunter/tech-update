import type { Kind, Source } from "@tech-update/shared";
import type { DB } from "./migrate.js";

export type ItemStatus = "published" | "hidden";
export type RunStatus = "ok" | "failed" | "partial";
export type Priority = "high" | "normal";

export type ItemRow = {
  id: number;
  slug: string;
  date: string;
  kind: Kind;
  title: string;
  summary: string;
  why: string;
  how_to_try: string | null;
  heat: 2 | 3 | 4 | 5;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
  run_id: number | null;
};
export type LinkRow = { item_id: number; label: string; url: string; is_primary: number };
export type MentionRow = {
  item_id: number;
  account_handle: string | null;
  account_name: string | null;
  source: Source;
  url: string;
  metric: string | null;
  seen_at: string;
};
export type RunRow = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  backend: string;
  items_added: number;
  items_updated: number;
  items_rejected: number;
  error: string | null;
  notes: string | null;
};
export type StoredBriefPoint = { title: string; text: string; item_slugs: string[] };
export type BriefRow = {
  month: string;
  headline: string;
  points: StoredBriefPoint[];
  period_label: string;
  updated_at: string;
  run_id: number | null;
};
export type AccountRow = { handle: string; name: string; description: string; priority: Priority; active: number };

// ---- health

export function ping(db: DB): boolean {
  return (db.prepare("SELECT 1 AS one").get() as { one: number } | undefined)?.one === 1;
}

// ---- runs

export function insertRun(
  db: DB,
  run: { started_at: string; status: RunStatus; backend: string; notes?: string | null; error?: string | null; finished_at?: string | null },
): number {
  const info = db
    .prepare(
      `INSERT INTO runs (started_at, finished_at, status, backend, error, notes)
       VALUES (@started_at, @finished_at, @status, @backend, @error, @notes)`,
    )
    .run({ finished_at: null, error: null, notes: null, ...run });
  return Number(info.lastInsertRowid);
}

export function finishRun(
  db: DB,
  id: number,
  r: { status: RunStatus; finished_at: string; added: number; updated: number; rejected: number; error?: string | null },
): void {
  db.prepare(
    `UPDATE runs SET status = @status, finished_at = @finished_at, items_added = @added,
       items_updated = @updated, items_rejected = @rejected, error = @error WHERE id = @id`,
  ).run({ error: null, ...r, id });
}

export function listRuns(db: DB, limit: number): RunRow[] {
  return db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit) as RunRow[];
}

/** finished_at of the newest ok/partial run. */
export function lastSuccessAt(db: DB): string | null {
  const row = db
    .prepare("SELECT finished_at FROM runs WHERE status IN ('ok', 'partial') ORDER BY id DESC LIMIT 1")
    .get() as { finished_at: string | null } | undefined;
  return row?.finished_at ?? null;
}

// ---- items (write side)

export function getItemBySlug(db: DB, slug: string): ItemRow | undefined {
  return db.prepare("SELECT * FROM items WHERE slug = ?").get(slug) as ItemRow | undefined;
}

export function getItemById(db: DB, id: number): ItemRow | undefined {
  return db.prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow | undefined;
}

export function existingSlugs(db: DB, slugs: string[]): Set<string> {
  if (slugs.length === 0) return new Set();
  const rows = db
    .prepare(`SELECT slug FROM items WHERE slug IN (${slugs.map(() => "?").join(",")})`)
    .all(...slugs) as { slug: string }[];
  return new Set(rows.map((r) => r.slug));
}

export function allLinkUrls(db: DB): { item_id: number; url: string }[] {
  return db.prepare("SELECT item_id, url FROM item_links").all() as { item_id: number; url: string }[];
}

export function allPrimaryLinkUrls(db: DB): { item_id: number; url: string }[] {
  return db.prepare("SELECT item_id, url FROM item_links WHERE is_primary = 1").all() as { item_id: number; url: string }[];
}

export function allMentionUrls(db: DB): { item_id: number; url: string }[] {
  return db.prepare("SELECT item_id, url FROM item_mentions").all() as { item_id: number; url: string }[];
}

export function itemHasPrimaryLink(db: DB, itemId: number): boolean {
  return db.prepare("SELECT 1 FROM item_links WHERE item_id = ? AND is_primary = 1").get(itemId) !== undefined;
}

type ItemFields = Pick<ItemRow, "kind" | "title" | "summary" | "why" | "how_to_try" | "heat">;

export function insertItem(
  db: DB,
  item: ItemFields & { slug: string; date: string; run_id: number; now: string },
): number {
  const info = db
    .prepare(
      `INSERT INTO items (slug, date, kind, title, summary, why, how_to_try, heat, status, created_at, updated_at, run_id)
       VALUES (@slug, @date, @kind, @title, @summary, @why, @how_to_try, @heat, 'published', @now, @now, @run_id)`,
    )
    .run(item);
  return Number(info.lastInsertRowid);
}

export function updateItem(db: DB, id: number, item: ItemFields & { run_id: number; now: string }): void {
  db.prepare(
    `UPDATE items SET kind = @kind, title = @title, summary = @summary, why = @why, how_to_try = @how_to_try,
       heat = @heat, updated_at = @now, run_id = @run_id WHERE id = @id`,
  ).run({ ...item, id });
}

export function insertLink(db: DB, itemId: number, link: { label: string; url: string; is_primary: boolean }): void {
  db.prepare("INSERT OR IGNORE INTO item_links (item_id, label, url, is_primary) VALUES (?, ?, ?, ?)").run(
    itemId,
    link.label,
    link.url,
    link.is_primary ? 1 : 0,
  );
}

export function insertMention(
  db: DB,
  itemId: number,
  m: { account_handle: string | null; source: Source; url: string; metric: string | null; seen_at: string },
): void {
  db.prepare(
    `INSERT OR IGNORE INTO item_mentions (item_id, account_handle, source, url, metric, seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(itemId, m.account_handle, m.source, m.url, m.metric, m.seen_at);
}

export function setItemStatus(db: DB, slug: string, status: ItemStatus): boolean {
  return db.prepare("UPDATE items SET status = ? WHERE slug = ?").run(status, slug).changes > 0;
}

// ---- items (read side, published only)

export function listPublishedItems(
  db: DB,
  f: { since?: string; month?: string; kind?: Kind; by?: string; limit?: number; order?: "day" | "newest" } = {},
): ItemRow[] {
  const where = ["i.status = 'published'"];
  const params: Record<string, unknown> = {};
  if (f.since) {
    where.push("i.date >= @since");
    params.since = f.since;
  }
  if (f.month) {
    where.push("substr(i.date, 1, 7) = @month");
    params.month = f.month;
  }
  if (f.kind) {
    where.push("i.kind = @kind");
    params.kind = f.kind;
  }
  if (f.by) {
    where.push("EXISTS (SELECT 1 FROM item_mentions m WHERE m.item_id = i.id AND m.account_handle = @by)");
    params.by = f.by;
  }
  const order = f.order === "newest" ? "i.date DESC, i.created_at DESC, i.id DESC" : "i.date DESC, i.heat DESC, i.id DESC";
  const limit = f.limit ? `LIMIT ${Math.trunc(f.limit)}` : "";
  return db.prepare(`SELECT i.* FROM items i WHERE ${where.join(" AND ")} ORDER BY ${order} ${limit}`).all(params) as ItemRow[];
}

export function getPublishedItem(db: DB, slug: string): ItemRow | undefined {
  return db.prepare("SELECT * FROM items WHERE slug = ? AND status = 'published'").get(slug) as ItemRow | undefined;
}

/** Published items for the given slugs, keyed by slug. */
export function publishedItemsBySlug(db: DB, slugs: string[]): Map<string, ItemRow> {
  if (slugs.length === 0) return new Map();
  const rows = db
    .prepare(`SELECT * FROM items WHERE status = 'published' AND slug IN (${slugs.map(() => "?").join(",")})`)
    .all(...slugs) as ItemRow[];
  return new Map(rows.map((r) => [r.slug, r]));
}

function byItemIds<T>(db: DB, sql: (placeholders: string) => string, ids: number[]): T[] {
  if (ids.length === 0) return [];
  return db.prepare(sql(ids.map(() => "?").join(","))).all(...ids) as T[];
}

export function linksFor(db: DB, ids: number[]): LinkRow[] {
  return byItemIds<LinkRow>(
    db,
    (p) => `SELECT item_id, label, url, is_primary FROM item_links WHERE item_id IN (${p}) ORDER BY is_primary DESC, id`,
    ids,
  );
}

export function mentionsFor(db: DB, ids: number[]): MentionRow[] {
  return byItemIds<MentionRow>(
    db,
    (p) => `SELECT m.item_id, m.account_handle, a.name AS account_name, m.source, m.url, m.metric, m.seen_at
            FROM item_mentions m LEFT JOIN accounts a ON a.handle = m.account_handle
            WHERE m.item_id IN (${p}) ORDER BY m.id`,
    ids,
  );
}

/** All items (any status) dated on/after `since`, with their link and mention URLs. For the researcher. */
export function stateItems(db: DB, since: string): { slug: string; title: string; date: string; urls: string[] }[] {
  const items = db
    .prepare("SELECT id, slug, title, date FROM items WHERE date >= ? ORDER BY date DESC, id DESC")
    .all(since) as { id: number; slug: string; title: string; date: string }[];
  const ids = items.map((i) => i.id);
  const urls = new Map<number, string[]>();
  for (const r of [...linksFor(db, ids), ...mentionsFor(db, ids)]) {
    const list = urls.get(r.item_id) ?? [];
    list.push(r.url);
    urls.set(r.item_id, list);
  }
  return items.map(({ id, ...rest }) => ({ ...rest, urls: urls.get(id) ?? [] }));
}

/** Months (YYYY-MM) that have published items or a brief, newest first, with published item counts. */
export function listMonths(db: DB): { month: string; count: number }[] {
  return db
    .prepare(
      `SELECT month, SUM(n) AS count FROM (
         SELECT substr(date, 1, 7) AS month, 1 AS n FROM items WHERE status = 'published'
         UNION ALL SELECT month, 0 AS n FROM briefs
       ) GROUP BY month ORDER BY month DESC`,
    )
    .all() as { month: string; count: number }[];
}

// ---- briefs

type RawBrief = Omit<BriefRow, "points"> & { points: string };
const parseBrief = (row: RawBrief | undefined): BriefRow | undefined =>
  row && { ...row, points: JSON.parse(row.points) as StoredBriefPoint[] };

export function upsertBrief(db: DB, b: BriefRow): void {
  db.prepare(
    `INSERT INTO briefs (month, headline, points, period_label, updated_at, run_id)
     VALUES (@month, @headline, @points, @period_label, @updated_at, @run_id)
     ON CONFLICT (month) DO UPDATE SET headline = excluded.headline, points = excluded.points,
       period_label = excluded.period_label, updated_at = excluded.updated_at, run_id = excluded.run_id`,
  ).run({ ...b, points: JSON.stringify(b.points) });
}

export function getBrief(db: DB, month: string): BriefRow | undefined {
  return parseBrief(db.prepare("SELECT * FROM briefs WHERE month = ?").get(month) as RawBrief | undefined);
}

export function getLatestBrief(db: DB): BriefRow | undefined {
  return parseBrief(db.prepare("SELECT * FROM briefs ORDER BY month DESC LIMIT 1").get() as RawBrief | undefined);
}

// ---- accounts

export function listAccounts(db: DB, f: { priority?: Priority } = {}): AccountRow[] {
  const prio = f.priority ? "AND priority = @priority" : "";
  return db
    .prepare(`SELECT * FROM accounts WHERE active = 1 ${prio} ORDER BY priority = 'high' DESC, rowid`)
    .all(f.priority ? { priority: f.priority } : {}) as AccountRow[];
}

export function getAccount(db: DB, handle: string): AccountRow | undefined {
  return db.prepare("SELECT * FROM accounts WHERE handle = ?").get(handle) as AccountRow | undefined;
}

export function upsertAccount(db: DB, a: AccountRow): void {
  db.prepare(
    `INSERT INTO accounts (handle, name, description, priority, active)
     VALUES (@handle, @name, @description, @priority, @active)
     ON CONFLICT (handle) DO UPDATE SET name = excluded.name, description = excluded.description,
       priority = excluded.priority, active = excluded.active`,
  ).run(a);
}
