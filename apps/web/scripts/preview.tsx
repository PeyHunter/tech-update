// Renders every public page from fixture models into preview-out/ for visual review.
// Run from apps/web: npx tsx scripts/preview.tsx
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderArchiveIndex,
  renderArchiveMonth,
  renderHome,
  renderItem,
  renderNotFound,
  renderSources,
  renderStatus,
} from "../src/views/index.js";
import type { AccountView, BriefView, HomeModel, ItemView, RunView } from "../src/views/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "preview-out");

const accounts: AccountView[] = [
  { handle: "poteto", name: "Lauren", description: "Grok at SpaceX/xAI, React compiler core, ex-Cursor/Meta/Netflix", priority: "high" },
  { handle: "mattpocockuk", name: "Matt Pocock", description: "TypeScript and AI teacher (AI Hero)", priority: "high" },
  { handle: "theo", name: "Theo", description: "T3 Code, T3 Chat, YouTube", priority: "high" },
  { handle: "thdxr", name: "dax", description: "opencode", priority: "normal" },
  { handle: "thsottiaux", name: "Tibo", description: "Codex and ChatGPT at OpenAI", priority: "normal" },
  { handle: "alexandr_wang", name: "Alexandr Wang", description: "Meta Superintelligence Labs", priority: "normal" },
  { handle: "davis7", name: "Ben Davis", description: "Nerd Snipe podcast", priority: "normal" },
  { handle: "tobi", name: "Tobi Lütke", description: "Shopify", priority: "normal" },
];
const people = accounts.filter((a) => a.priority === "high");

const items: ItemView[] = [
  {
    slug: "2026-11-04-claude-code-plugins-marketplace",
    date: "2026-11-04",
    kind: "try",
    title: "Claude Code adds a public plugin marketplace",
    summary: "Plugins bundle skills, hooks and MCP servers. You can now install them from a shared marketplace with one command.",
    why: "Teams can share their setup instead of copying config files between repos. It also makes small tools easy to find.",
    how_to_try: "Run `claude plugin marketplace add anthropics/claude-plugins-official`, then `/plugin` inside a session to browse.",
    heat: 5,
    links: [
      { label: "GitHub discussion", url: "https://github.com/anthropics/claude-code/discussions/1234", is_primary: false },
      { label: "Announcement", url: "https://www.anthropic.com/news/claude-code-plugins-marketplace-and-a-very-long-url-that-must-wrap-on-small-screens", is_primary: true },
    ],
    mentions: [
      { account_handle: "theo", account_name: "Theo", source: "x", url: "https://x.com/theo/status/1", metric: null },
      { account_handle: "mattpocockuk", account_name: "Matt Pocock", source: "x", url: "https://x.com/mattpocockuk/status/2", metric: null },
      { account_handle: null, account_name: null, source: "hn", url: "https://news.ycombinator.com/item?id=1", metric: "640 points" },
    ],
  },
  {
    slug: "2026-11-04-gemini-3-flash",
    date: "2026-11-04",
    kind: "news",
    title: "Google releases Gemini 3 Flash with a 2M token context",
    summary: "The new Flash model is cheaper than Gemini 2.5 Pro and scores higher on Google's own coding benchmarks.",
    why: "A cheap model with a very long context changes what is practical for whole-repo questions and long documents.",
    how_to_try: null,
    heat: 4,
    links: [{ label: "Google blog", url: "https://blog.google/technology/ai/gemini-3-flash/", is_primary: true }],
    mentions: [
      { account_handle: "poteto", account_name: "Lauren", source: "x", url: "https://x.com/poteto/status/3", metric: null },
      { account_handle: null, account_name: null, source: "hn", url: "https://news.ycombinator.com/item?id=2", metric: "412 points" },
    ],
  },
  {
    slug: "2026-11-03-react-compiler-1-1",
    date: "2026-11-03",
    kind: "try",
    title: "React Compiler 1.1 works with any Vite project",
    summary: "The compiler now ships a Vite plugin that needs no Babel config. It memoizes components for you at build time.",
    why: "Most React apps can drop manual useMemo and useCallback. Less code, fewer stale-closure bugs.",
    how_to_try: "In a Vite app, run `npm i -D babel-plugin-react-compiler@latest` and add `reactCompiler()` to `vite.config.ts`.",
    heat: 3,
    links: [
      { label: "Release notes", url: "https://react.dev/blog/2026/11/03/react-compiler-1-1", is_primary: true },
      { label: "Repo", url: "https://github.com/facebook/react", is_primary: false },
    ],
    mentions: [{ account_handle: "poteto", account_name: "Lauren", source: "x", url: "https://x.com/poteto/status/4", metric: null }],
  },
  {
    slug: "2026-11-03-openai-codex-cloud-tasks",
    date: "2026-11-03",
    kind: "news",
    title: "OpenAI opens Codex cloud tasks to all Plus users",
    summary: "Codex can now run tasks in a cloud sandbox for every Plus subscriber, not only Pro and Team.",
    why: "Background agents that open pull requests are now a mainstream feature, not an enterprise one.",
    how_to_try: null,
    heat: 4,
    links: [{ label: "OpenAI changelog", url: "https://help.openai.com/en/articles/codex-changelog", is_primary: true }],
    mentions: [
      { account_handle: "thsottiaux", account_name: "Tibo", source: "x", url: "https://x.com/thsottiaux/status/5", metric: null },
      { account_handle: "theo", account_name: "Theo", source: "youtube", url: "https://youtube.com/watch?v=abc", metric: null },
    ],
  },
  {
    slug: "2026-11-02-typescript-7-native",
    date: "2026-11-02",
    kind: "try",
    title: "TypeScript 7 native compiler is stable",
    summary: "The Go port of the TypeScript compiler is now the default. Type checks run about ten times faster on large projects.",
    why: "Faster type checks make agents and editors respond quicker on big codebases.",
    how_to_try: "Run `npm i -D typescript@7` and keep using `tsc` as before.",
    heat: 3,
    links: [{ label: "TypeScript blog", url: "https://devblogs.microsoft.com/typescript/announcing-typescript-7/", is_primary: true }],
    mentions: [
      { account_handle: "mattpocockuk", account_name: "Matt Pocock", source: "newsletter", url: "https://aihero.dev/ts7", metric: null },
      { account_handle: null, account_name: null, source: "hn", url: "https://news.ycombinator.com/item?id=3", metric: "980 points" },
    ],
  },
  {
    slug: "2026-11-02-small-diff-tool",
    date: "2026-11-02",
    kind: "try",
    title: "difftastic-ai explains a diff in one paragraph",
    summary: "A small CLI that reads `git diff` and writes a short plain-English summary using a local model.",
    why: "Useful for reviewing agent-written changes before you read every line.",
    how_to_try: "Run `npx difftastic-ai` inside any git repo with staged changes.",
    heat: 2,
    links: [{ label: "GitHub", url: "https://github.com/example/difftastic-ai", is_primary: true }],
    mentions: [{ account_handle: null, account_name: null, source: "github", url: "https://github.com/trending", metric: "1.2k stars this week" }],
  },
];

const byDay = (list: ItemView[]): HomeModel["days"] => {
  const map = new Map<string, ItemView[]>();
  for (const it of list) map.set(it.date, [...(map.get(it.date) ?? []), it]);
  return [...map].map(([date, its]) => ({ date, items: its.sort((a, b) => b.heat - a.heat) }));
};

const brief: BriefView = {
  month: "2026-11",
  headline: "Coding agents moved out of the terminal and into the background, and the tools around them got faster.",
  period_label: "November 2026, so far",
  updated_at: "2026-11-04T02:41:00Z",
  points: [
    { title: "Claude Code has a plugin marketplace", text: "Skills, hooks and MCP servers now install with one command. It matters because teams can share a setup. Try `/plugin` in a session.", items: [{ slug: items[0]!.slug, title: items[0]!.title }] },
    { title: "Gemini 3 Flash is cheap with a huge context", text: "Two million tokens at Flash prices. Whole-repo questions become practical.", items: [{ slug: items[1]!.slug, title: items[1]!.title }] },
    { title: "Codex cloud tasks for all Plus users", text: "Background agents that open pull requests are now a standard feature.", items: [{ slug: items[3]!.slug, title: items[3]!.title }] },
    { title: "React Compiler is easy to adopt", text: "A Vite plugin with no Babel config. Most apps can drop manual memoization.", items: [{ slug: items[2]!.slug, title: items[2]!.title }] },
    { title: "TypeScript 7 is the default", text: "The native compiler is stable and about ten times faster.", items: [{ slug: items[4]!.slug, title: items[4]!.title }, { slug: items[5]!.slug, title: items[5]!.title }] },
  ],
};

const runs: RunView[] = Array.from({ length: 14 }, (_, i) => {
  const status = i === 2 ? "failed" : i === 5 ? "partial" : "ok";
  const started = Date.UTC(2026, 10, 4, 2, 0) - i * 86_400_000;
  return {
    id: 40 - i,
    started_at: new Date(started).toISOString(),
    finished_at: status === "failed" ? null : new Date(started + 360_000).toISOString(),
    duration_s: status === "failed" ? 41 : 300 + i * 17,
    status,
    backend: i === 7 ? "api" : "claude-code",
    items_added: status === "failed" ? 0 : (i * 3) % 7,
    items_updated: status === "failed" ? 0 : i % 4,
    items_rejected: status === "partial" ? 2 : 0,
    error: status === "failed" ? "claude-code exited with code 1: usage limit reached, see https://support.anthropic.com/en/articles/usage-limits-for-subscriptions" : null,
  };
});

const lastUpdated = "2026-11-04T02:41:00Z";
const base = { lastUpdated };
const pages: Record<string, string> = {
  "index.html": renderHome({ ...base, title: "tech-update", path: "/", brief, days: byDay(items), filter: { kind: "all", by: null }, people }),
  "home-try-theo.html": renderHome({ ...base, title: "tech-update", path: "/", brief, days: byDay(items.filter((i) => i.kind === "try" && i.mentions.some((m) => m.account_handle === "theo"))), filter: { kind: "try", by: "theo" }, people }),
  "home-empty-filter.html": renderHome({ ...base, title: "tech-update", path: "/", brief, days: [], filter: { kind: "news", by: "mattpocockuk" }, people }),
  "home-empty.html": renderHome({ title: "tech-update", lastUpdated: null, path: "/", brief: null, days: [], filter: { kind: "all", by: null }, people }),
  "item.html": renderItem({ ...base, title: items[0]!.title, path: `/item/${items[0]!.slug}`, item: items[0]! }),
  "item-news.html": renderItem({ ...base, title: items[1]!.title, path: `/item/${items[1]!.slug}`, item: items[1]! }),
  "archive.html": renderArchiveIndex({ ...base, title: "Archive", path: "/archive", months: [{ month: "2026-11", count: 6 }, { month: "2026-10", count: 41 }, { month: "2026-09", count: 1 }] }),
  "archive-month.html": renderArchiveMonth({ ...base, title: "November 2026", path: "/archive/2026-11", month: "2026-11", brief, days: byDay(items) }),
  "archive-month-empty.html": renderArchiveMonth({ ...base, title: "September 2026", path: "/archive/2026-09", month: "2026-09", brief: null, days: [] }),
  "sources.html": renderSources({ ...base, title: "Sources", path: "/sources", accounts }),
  "status.html": renderStatus({ ...base, title: "Status", path: "/status", runs }),
  "404.html": renderNotFound({ ...base, title: "Page not found", path: "/item/2026-11-01-does-not-exist" }),
};

mkdirSync(out, { recursive: true });
for (const [name, html] of Object.entries(pages)) writeFileSync(join(out, name), html);
copyFileSync(join(root, "src/views/styles.css"), join(out, "styles.css"));
console.log(`wrote ${Object.keys(pages).length} pages to ${out}`);
