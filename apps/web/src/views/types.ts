import type { Kind, Source, WatchedRepo } from "@tech-update/shared";

export type ItemView = {
  slug: string;
  date: string;
  kind: Kind;
  title: string;
  summary: string;
  why: string;
  how_to_try: string | null;
  heat: 2 | 3 | 4 | 5;
  links: { label: string; url: string; is_primary: boolean }[];
  mentions: { account_handle: string | null; account_name: string | null; source: Source; url: string; metric: string | null }[];
};
export type BriefView = {
  month: string;
  headline: string;
  period_label: string;
  points: { title: string; text: string; items: { slug: string; title: string }[] }[];
  updated_at: string;
};
export type RunView = {
  id: number;
  started_at: string;
  finished_at: string | null;
  duration_s: number | null;
  status: string;
  backend: string;
  items_added: number;
  items_updated: number;
  items_rejected: number;
  error: string | null;
};
export type AccountView = { handle: string; name: string; description: string; priority: "high" | "normal" };
export type Layout = { title: string; lastUpdated: string | null; path: string };
export type PersonUpdates = {
  handle: string;
  name: string;
  updates: { date: string; source: Source; text: string; url: string }[];
};
export type HomeModel = Layout & {
  following: PersonUpdates[];
  brief: BriefView | null;
  days: { date: string; items: ItemView[] }[];
  filter: { kind: "all" | "news" | "try"; by: string | null };
  people: AccountView[] /* high priority */;
};
export type ItemModel = Layout & { item: ItemView };
export type ArchiveIndexModel = Layout & { months: { month: string; count: number }[] };
export type ArchiveMonthModel = Layout & { month: string; brief: BriefView | null; days: HomeModel["days"] };
export type SourcesModel = Layout & { accounts: AccountView[]; repos: WatchedRepo[] };
export type RefreshOutcome = "started" | "running" | "cooldown" | "unavailable" | "failed";
export type StatusModel = Layout & { runs: RunView[]; refresh: RefreshOutcome | null };
