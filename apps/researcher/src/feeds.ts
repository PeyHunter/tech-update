import type { StateResponse } from "@tech-update/shared";

/**
 * Before the model runs, the wrapper reads each followed person's recent posts from free feeds and writes
 * them to /out/feeds.json. The model cannot read x.com, and web search finds X posts days late or not at all.
 *
 * X posts come from FxTwitter's public API (api.fxtwitter.com), which answers with real, fresh timelines but
 * sometimes returns a spurious 404, so it is retried. Everything else is plain RSS or Atom.
 */

export type FeedKind = "youtube" | "podcast" | "newsletter" | "github";
export type ExtraFeed = { kind: FeedKind; label: string; url: string };

const yt = (label: string, channelId: string): ExtraFeed => ({
  kind: "youtube",
  label,
  url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
});
const gh = (user: string): ExtraFeed => ({ kind: "github", label: `GitHub ${user}`, url: `https://github.com/${user}.atom` });

const NERD_SNIPE: ExtraFeed = { kind: "podcast", label: "Nerd Snipe podcast", url: "https://anchor.fm/s/1112097e0/podcast/rss" };
const HARD_FORK: ExtraFeed = { kind: "podcast", label: "Hard Fork podcast", url: "https://feeds.simplecast.com/l2i9YnTd" };
const MACHINE_GODS: ExtraFeed = { kind: "podcast", label: "Machine Gods podcast", url: "https://feeds.npr.org/g-s1-143588/podcast.xml" };

/** Where each followed person publishes outside X. Keyed by X handle, lower case. */
export const PEOPLE_FEEDS: Record<string, ExtraFeed[]> = {
  poteto: [gh("poteto")],
  mattpocockuk: [
    yt("Matt Pocock on YouTube", "UCswG6FSbgZjbWtdf_hMLaow"),
    { kind: "newsletter", label: "AI Hero", url: "https://www.aihero.dev/rss.xml" },
    gh("mattpocock"),
  ],
  theo: [yt("Theo on YouTube", "UCbRP3c757lWg9M-U7TyEkXA"), NERD_SNIPE, gh("t3dotgg")],
  thdxr: [{ kind: "github", label: "opencode releases", url: "https://github.com/sst/opencode/releases.atom" }, gh("thdxr")],
  davis7: [NERD_SNIPE, gh("davis7dotsh")],
  vojta_holik: [gh("vojtaholik")],
  tobi: [gh("tobi")],
  kevinroose: [HARD_FORK, MACHINE_GODS],
  caseynewton: [{ kind: "newsletter", label: "Platformer", url: "https://www.platformer.news/rss/" }, HARD_FORK, MACHINE_GODS],
  ezraklein: [{ kind: "podcast", label: "The Ezra Klein Show", url: "https://feeds.simplecast.com/82FI35Px" }],
};

export type FeedPost = {
  source: "x" | FeedKind;
  feed: string;
  date: string;
  url: string;
  text: string;
  /** X only. */
  likes?: number;
  views?: number;
  repost_of?: string;
  reply_to?: string;
  quote?: string;
};

export type PersonFeed = { handle: string; name: string; posts: FeedPost[]; errors: string[] };
export type FeedsFile = { since: string; generated_at: string; people: PersonFeed[] };

type Fetch = typeof fetch;
type Opts = { fetch: Fetch; sleep?: (ms: number) => Promise<void>; timeoutMs?: number };

const UA = "tech-update-researcher/1.0 (+https://tech-update.peytonhunter.com)";
const MAX_TEXT = 600;
const MAX_POSTS_PER_FEED = 25;

const clip = (s: string, n = MAX_TEXT) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function get(url: string, opts: Opts): Promise<Response> {
  return opts.fetch(url, {
    headers: { "user-agent": UA, accept: "application/json, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
}

type FxStatus = {
  url?: string;
  text?: string;
  created_timestamp?: number;
  created_at?: string;
  likes?: number;
  views?: number | null;
  author?: { screen_name?: string };
  reposted_by?: { screen_name?: string } | null;
  replying_to?: { screen_name?: string } | string | null;
  quote?: { text?: string; author?: { screen_name?: string } } | null;
};

export function parseFxStatuses(handle: string, body: unknown, since: Date): FeedPost[] {
  const results = (body as { results?: FxStatus[] })?.results;
  if (!Array.isArray(results)) return [];
  const posts: FeedPost[] = [];
  for (const s of results) {
    const ms = s.created_timestamp ? s.created_timestamp * 1000 : Date.parse(s.created_at ?? "");
    if (!Number.isFinite(ms) || ms < since.getTime() || !s.url?.startsWith("https://")) continue;
    const author = s.author?.screen_name;
    const repost = author && author.toLowerCase() !== handle ? author : undefined;
    const reply = typeof s.replying_to === "string" ? s.replying_to : s.replying_to?.screen_name;
    const post: FeedPost = {
      source: "x",
      feed: "X",
      date: new Date(ms).toISOString(),
      url: s.url.replace("https://twitter.com/", "https://x.com/"),
      text: clip(s.text ?? ""),
    };
    if (typeof s.likes === "number") post.likes = s.likes;
    if (typeof s.views === "number") post.views = s.views;
    if (repost) post.repost_of = repost;
    if (reply) post.reply_to = reply;
    if (s.quote?.text) post.quote = clip(`@${s.quote.author?.screen_name ?? "?"}: ${s.quote.text}`, 300);
    posts.push(post);
  }
  return posts;
}

async function readX(handle: string, since: Date, opts: Opts): Promise<FeedPost[]> {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * attempt);
    try {
      const res = await get(`https://api.fxtwitter.com/2/profile/${handle}/statuses`, opts);
      if (res.ok) {
        const body = await res.json();
        if ((body as { code?: number }).code === 200) return parseFxStatuses(handle, body, since);
        last = `code ${(body as { code?: number }).code}`;
      } else last = `HTTP ${res.status}`;
    } catch (err) {
      last = (err as Error).message;
    }
  }
  throw new Error(`X via FxTwitter failed after 4 tries: ${last}`);
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1]! : null;
}

/** Minimal RSS 2.0 / Atom reader: title, link, date and a short description per entry. */
export function parseFeedXml(xml: string, extra: ExtraFeed, since: Date): FeedPost[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const posts: FeedPost[] = [];
  for (const b of blocks.slice(0, MAX_POSTS_PER_FEED * 2)) {
    const when = tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date");
    const ms = when ? Date.parse(decode(when).replace(" UTC", "Z")) : NaN;
    if (!Number.isFinite(ms) || ms < since.getTime()) continue;
    const href =
      b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i)?.[1] ??
      b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ??
      decode(tag(b, "link") ?? "");
    if (!href.startsWith("https://")) continue;
    const title = decode(tag(b, "title") ?? "");
    const body = decode(tag(b, "media:description") ?? tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content") ?? "");
    posts.push({
      source: extra.kind,
      feed: extra.label,
      date: new Date(ms).toISOString(),
      url: href.replace(/&amp;/g, "&"),
      text: clip(body && body !== title ? `${title} — ${body}` : title),
    });
    if (posts.length >= MAX_POSTS_PER_FEED) break;
  }
  return posts;
}

async function readExtra(extra: ExtraFeed, since: Date, opts: Opts): Promise<FeedPost[]> {
  const res = await get(extra.url, opts);
  if (!res.ok) throw new Error(`${extra.label}: HTTP ${res.status}`);
  return parseFeedXml(await res.text(), extra, since);
}

/** Never throws: a feed that fails is listed in that person's `errors` so the model can fall back to search. */
export async function collectFeeds(
  accounts: StateResponse["accounts"],
  since: Date,
  now: Date,
  opts: Opts,
): Promise<FeedsFile> {
  const people = await Promise.all(
    accounts.map(async (a, i): Promise<PersonFeed> => {
      const handle = a.handle.toLowerCase();
      const errors: string[] = [];
      // Stagger X calls a little so twelve people do not hit FxTwitter in the same instant.
      const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
      const xPosts = sleep(i * 400).then(() => readX(handle, since, opts));
      const jobs = [xPosts, ...(PEOPLE_FEEDS[handle] ?? []).map((f) => readExtra(f, since, opts))];
      const settled = await Promise.allSettled(jobs);
      const posts: FeedPost[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled") posts.push(...s.value);
        else errors.push((s.reason as Error)?.message ?? String(s.reason));
      }
      const seen = new Set<string>();
      const unique = posts.filter((p) => !seen.has(p.url) && seen.add(p.url));
      unique.sort((x, y) => y.date.localeCompare(x.date));
      return { handle, name: a.name, posts: unique, errors };
    }),
  );
  return { since: since.toISOString(), generated_at: now.toISOString(), people };
}
