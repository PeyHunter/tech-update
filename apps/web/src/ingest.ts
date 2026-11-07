import { parseResultFile, type IngestResponse } from "@tech-update/shared";
import type { DB } from "./db/migrate.js";
import * as repo from "./db/repo.js";
import { monthOf, today, windowStart } from "./time.js";

/** Lowercase host, no hash, no utm_* params, no trailing slash. Used only for matching, never stored. */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim().toLowerCase();
  }
  for (const key of [...u.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
  }
  const path = u.pathname.replace(/\/+$/, "");
  const search = u.searchParams.size > 0 ? `?${u.searchParams.toString()}` : "";
  return `${u.protocol}//${u.host.toLowerCase()}${path}${search}`;
}

export type IngestResult =
  | { ok: true; response: IngestResponse }
  | { ok: false; run_id: number; errors: string[] };

export function recordFailedRun(db: DB, run: { started_at: string; backend: string; error: string }, now = new Date()): number {
  return repo.insertRun(db, { ...run, status: "failed", finished_at: now.toISOString() });
}

function failedRunFrom(json: unknown): { started_at: string; backend: string } {
  const run = (json as { run?: { started_at?: unknown; backend?: unknown } } | null)?.run;
  const started = typeof run?.started_at === "string" && !Number.isNaN(Date.parse(run.started_at)) ? run.started_at : null;
  return {
    started_at: started ?? new Date().toISOString(),
    backend: typeof run?.backend === "string" ? run.backend : "unknown",
  };
}

/** Index of normalized URL -> item id, plus each item's own normalized URLs. */
class UrlIndex {
  private byUrl = new Map<string, number>();
  private byItem = new Map<number, Set<string>>();
  constructor(rows: { item_id: number; url: string }[]) {
    for (const r of rows) this.add(r.item_id, r.url);
  }
  find(urls: string[]): number | undefined {
    for (const url of urls) {
      const id = this.byUrl.get(normalizeUrl(url));
      if (id !== undefined) return id;
    }
    return undefined;
  }
  has(itemId: number, url: string): boolean {
    return this.byItem.get(itemId)?.has(normalizeUrl(url)) ?? false;
  }
  add(itemId: number, url: string): void {
    const n = normalizeUrl(url);
    if (!this.byUrl.has(n)) this.byUrl.set(n, itemId);
    const set = this.byItem.get(itemId) ?? new Set();
    set.add(n);
    this.byItem.set(itemId, set);
  }
}

export function ingest(db: DB, json: unknown, opts: { now?: Date } = {}): IngestResult {
  const now = opts.now ?? new Date();
  const fail = (errors: string[]): IngestResult => ({
    ok: false,
    errors,
    run_id: recordFailedRun(db, { ...failedRunFrom(json), error: errors.join("; ") }, now),
  });

  const parsed = parseResultFile(json);
  if (!parsed.ok) return fail(parsed.errors);
  const result = parsed.value;

  if (result.brief) {
    const inPayload = new Set(result.items.map((i) => i.slug));
    const cited = result.brief.points.flatMap((p) => p.item_slugs);
    const inDb = repo.existingSlugs(db, cited.filter((s) => !inPayload.has(s)));
    const errors: string[] = [];
    result.brief.points.forEach((p, i) =>
      p.item_slugs.forEach((s, j) => {
        if (!inPayload.has(s) && !inDb.has(s)) errors.push(`brief.points[${i}].item_slugs[${j}]: unknown item ${s}`);
      }),
    );
    if (errors.length > 0) return fail(errors);
  }

  const nowIso = now.toISOString();
  const cutoff = windowStart(now);

  const response = db.transaction((): IngestResponse => {
    const runId = repo.insertRun(db, {
      started_at: result.run.started_at,
      status: "ok",
      backend: result.run.backend,
      notes: result.run.notes ?? null,
    });
    const links = new UrlIndex(repo.allLinkUrls(db));
    const mentions = new UrlIndex(repo.allMentionUrls(db));
    const storedSlug = new Map<string, string>();
    const added = new Set<number>();
    const updated = new Set<number>();
    const tooOld: string[] = [];

    for (const item of result.items) {
      if (item.date < cutoff) {
        tooOld.push(item.title);
        continue;
      }
      const existing =
        repo.getItemBySlug(db, item.slug) ??
        lookup(db, links.find(item.links.map((l) => l.url))) ??
        lookup(db, mentions.find(item.mentions.map((m) => m.url)));

      const fields = {
        kind: item.kind,
        title: item.title,
        summary: item.summary,
        why: item.why,
        how_to_try: item.how_to_try,
        run_id: runId,
        now: nowIso,
      };
      let id: number;
      if (existing) {
        id = existing.id;
        repo.updateItem(db, id, { ...fields, heat: Math.min(5, Math.max(existing.heat, item.heat)) as 2 | 3 | 4 | 5 });
        if (!added.has(id)) updated.add(id);
        storedSlug.set(item.slug, existing.slug);
      } else {
        id = repo.insertItem(db, { ...fields, slug: item.slug, date: item.date, heat: item.heat });
        added.add(id);
        storedSlug.set(item.slug, item.slug);
      }

      let hasPrimary = existing ? repo.itemHasPrimaryLink(db, id) : false;
      for (const link of item.links) {
        if (links.has(id, link.url)) continue;
        // One primary link per item: a merged-in primary becomes a secondary link.
        const isPrimary = link.is_primary && !hasPrimary;
        repo.insertLink(db, id, { ...link, is_primary: isPrimary });
        hasPrimary ||= isPrimary;
        links.add(id, link.url);
      }
      for (const m of item.mentions) {
        if (mentions.has(id, m.url)) continue;
        repo.insertMention(db, id, {
          account_handle: m.account_handle ?? null,
          source: m.source,
          url: m.url,
          metric: m.metric ?? null,
          seen_at: nowIso,
        });
        mentions.add(id, m.url);
      }
    }

    if (result.brief) {
      repo.upsertBrief(db, {
        month: monthOf(today(new Date(result.run.started_at))),
        headline: result.brief.headline,
        period_label: result.brief.period_label,
        points: result.brief.points.map((p) => ({
          title: p.title,
          text: p.text,
          item_slugs: [...new Set(p.item_slugs.map((s) => storedSlug.get(s) ?? s))],
        })),
        updated_at: nowIso,
        run_id: runId,
      });
    }

    // Updates from followed people: only known accounts, only the last 30 days, each post once.
    let updates = 0;
    for (const u of result.updates) {
      if (u.date < cutoff || !repo.getAccount(db, u.account_handle)) continue;
      if (repo.insertUpdate(db, { ...u, url: normalizeUrl(u.url), run_id: runId, now: nowIso })) updates++;
    }

    const rejected = tooOld.length + result.rejected.length;
    repo.finishRun(db, runId, {
      status: tooOld.length > 0 ? "partial" : "ok",
      finished_at: new Date().toISOString(),
      added: added.size,
      updated: updated.size,
      rejected,
      error: tooOld.length > 0 ? `older than 30 days: ${tooOld.join(", ")}` : null,
    });
    return { run_id: runId, added: added.size, updated: updated.size, rejected, updates };
  })();

  return { ok: true, response };
}

function lookup(db: DB, id: number | undefined): repo.ItemRow | undefined {
  return id === undefined ? undefined : repo.getItemById(db, id);
}
