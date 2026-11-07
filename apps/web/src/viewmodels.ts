import { WATCHED_REPOS, type Kind, type Source } from "@tech-update/shared";
import type { DB } from "./db/migrate.js";
import * as repo from "./db/repo.js";
import { addDays, today, windowStart, monthOf } from "./time.js";
import type {
  AccountView,
  ArchiveIndexModel,
  ArchiveMonthModel,
  BriefView,
  HomeModel,
  ItemModel,
  ItemView,
  Layout,
  PersonUpdates,
  RunView,
  SourcesModel,
  StatusModel,
} from "./views/types.js";

export const SITE_TITLE = "tech-update";

export function layout(db: DB, path: string, title = SITE_TITLE): Layout {
  return { title, lastUpdated: repo.lastSuccessAt(db), path };
}

function byItem<T extends { item_id: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const r of rows) map.set(r.item_id, [...(map.get(r.item_id) ?? []), r]);
  return map;
}

export function toItemViews(db: DB, rows: repo.ItemRow[]): ItemView[] {
  const ids = rows.map((r) => r.id);
  const links = byItem(repo.linksFor(db, ids));
  const mentions = byItem(repo.mentionsFor(db, ids));
  return rows.map((r) => ({
    slug: r.slug,
    date: r.date,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    why: r.why,
    how_to_try: r.how_to_try,
    heat: r.heat,
    links: (links.get(r.id) ?? []).map((l) => ({ label: l.label, url: l.url, is_primary: l.is_primary === 1 })),
    mentions: (mentions.get(r.id) ?? []).map((m) => ({
      account_handle: m.account_handle,
      account_name: m.account_name,
      source: m.source,
      url: m.url,
      metric: m.metric,
    })),
  }));
}

/** Rows must already be sorted date desc, heat desc. */
function groupByDay(items: ItemView[]): HomeModel["days"] {
  const days: HomeModel["days"] = [];
  for (const item of items) {
    const last = days.at(-1);
    if (last?.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }
  return days;
}

export function toBriefView(db: DB, b: repo.BriefRow | undefined): BriefView | null {
  if (!b) return null;
  const items = repo.publishedItemsBySlug(db, [...new Set(b.points.flatMap((p) => p.item_slugs))]);
  return {
    month: b.month,
    headline: b.headline,
    period_label: b.period_label,
    updated_at: b.updated_at,
    points: b.points.map((p) => ({
      title: p.title,
      text: p.text,
      items: p.item_slugs.flatMap((s) => {
        const it = items.get(s);
        return it ? [{ slug: it.slug, title: it.title }] : [];
      }),
    })),
  };
}

/** This month's brief, else the newest one. */
export function currentBrief(db: DB, now = new Date()): BriefView | null {
  return toBriefView(db, repo.getBrief(db, monthOf(today(now))) ?? repo.getLatestBrief(db));
}

const toAccountView = (a: repo.AccountRow): AccountView => ({
  handle: a.handle,
  name: a.name,
  description: a.description,
  priority: a.priority,
});

export function parseKind(k: string | undefined): Kind | undefined {
  return k === "news" || k === "try" ? k : undefined;
}

export function homeModel(db: DB, q: { path: string; kind?: string; by?: string }, now = new Date()): HomeModel {
  const kind = parseKind(q.kind);
  const by = q.by?.trim().replace(/^@/, "").toLowerCase() || null;
  const rows = repo.listPublishedItems(db, { since: windowStart(now), kind, by: by ?? undefined });
  return {
    ...layout(db, q.path),
    following: followingModel(db, now),
    brief: currentBrief(db, now),
    days: groupByDay(toItemViews(db, rows)),
    filter: { kind: kind ?? "all", by },
    people: repo.listAccounts(db, { priority: "high" }).map(toAccountView),
  };
}

/** Last 7 days of updates, grouped by person, people with the newest update first, at most 3 each. */
export function followingModel(db: DB, now = new Date()): PersonUpdates[] {
  const names = new Map(repo.listAccounts(db).map((a) => [a.handle, a.name]));
  const people = new Map<string, PersonUpdates>();
  for (const u of repo.listUpdates(db, addDays(today(now), -7))) {
    const person = people.get(u.account_handle) ?? {
      handle: u.account_handle,
      name: names.get(u.account_handle) ?? u.account_handle,
      updates: [],
    };
    if (person.updates.length < 3) person.updates.push({ date: u.date, source: u.source as Source, text: u.text, url: u.url });
    people.set(u.account_handle, person);
  }
  return [...people.values()];
}

export function itemModel(db: DB, slug: string, path: string): ItemModel | null {
  const row = repo.getPublishedItem(db, slug);
  if (!row) return null;
  const [item] = toItemViews(db, [row]);
  return { ...layout(db, path, `${row.title} · ${SITE_TITLE}`), item: item! };
}

export function archiveIndexModel(db: DB, path: string): ArchiveIndexModel {
  return { ...layout(db, path, `Archive · ${SITE_TITLE}`), months: repo.listMonths(db) };
}

export function archiveMonthModel(db: DB, month: string, path: string): ArchiveMonthModel | null {
  const brief = toBriefView(db, repo.getBrief(db, month));
  const rows = repo.listPublishedItems(db, { month });
  if (!brief && rows.length === 0) return null;
  return { ...layout(db, path, `${month} · ${SITE_TITLE}`), month, brief, days: groupByDay(toItemViews(db, rows)) };
}

export function sourcesModel(db: DB, path: string): SourcesModel {
  return {
    ...layout(db, path, `Sources · ${SITE_TITLE}`),
    accounts: repo.listAccounts(db).map(toAccountView),
    repos: WATCHED_REPOS,
  };
}

const REFRESH_OUTCOMES = ["started", "running", "cooldown", "unavailable", "failed"] as const;

export function statusModel(db: DB, path: string, refresh?: string): StatusModel {
  const runs: RunView[] = repo.listRuns(db, 14).map((r) => ({
    id: r.id,
    started_at: r.started_at,
    finished_at: r.finished_at,
    duration_s: r.finished_at
      ? Math.max(0, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000))
      : null,
    status: r.status,
    backend: r.backend,
    items_added: r.items_added,
    items_updated: r.items_updated,
    items_rejected: r.items_rejected,
    error: r.error,
  }));
  const outcome = REFRESH_OUTCOMES.find((o) => o === refresh) ?? null;
  return { ...layout(db, path, `Status · ${SITE_TITLE}`), runs, refresh: outcome };
}
