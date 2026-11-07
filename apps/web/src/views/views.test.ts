import { describe, expect, it } from "vitest";
import {
  renderArchiveIndex,
  renderArchiveMonth,
  renderHome,
  renderItem,
  renderNotFound,
  renderSources,
  renderStatus,
} from "./index.js";
import type { HomeModel, ItemView } from "./types.js";

const layout = { title: "tech-update", lastUpdated: "2026-11-04T02:41:00Z", path: "/" };

const item: ItemView = {
  slug: "2026-11-04-evil",
  date: "2026-11-04",
  kind: "try",
  title: "<script>alert(1)</script> & friends",
  summary: "Summary with `code` and <b>tags</b>",
  why: "Because.",
  how_to_try: "Run `npx <evil>` now",
  heat: 4,
  links: [
    { label: "Secondary", url: "https://example.com/b", is_primary: false },
    { label: "Primary", url: "https://example.com/a?x=1&y=2", is_primary: true },
  ],
  mentions: [
    { account_handle: "theo", account_name: "Theo", source: "x", url: "https://x.com/theo/status/1", metric: null },
    { account_handle: null, account_name: null, source: "hn", url: "https://news.ycombinator.com/item?id=1", metric: "640 points" },
  ],
};

const home = (over: Partial<HomeModel> = {}): string =>
  renderHome({
    ...layout,
    brief: null,
    days: [{ date: item.date, items: [item] }],
    filter: { kind: "all", by: null },
    people: [{ handle: "theo", name: "Theo", description: "T3", priority: "high" }],
    ...over,
  });

describe("views", () => {
  it("escapes titles and text", () => {
    const html = renderItem({ ...layout, title: item.title, path: `/item/${item.slug}`, item });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; friends");
    expect(html).not.toContain("<b>tags</b>");
    expect(html).toContain("<code>npx &lt;evil&gt;</code>");
    expect(home()).not.toContain("<script>");
  });

  it("labels the heat meter and lists the primary link first", () => {
    const html = home();
    expect(html).toContain('aria-label="Heat 4 of 5"');
    expect(html.indexOf("Primary")).toBeLessThan(html.indexOf("Secondary"));
    expect(html).toContain("HN · 640 points");
    expect(html).toContain("@theo");
  });

  it("keeps kind and person filters combinable", () => {
    const html = home({ filter: { kind: "try", by: "theo" } });
    expect(html).toContain('href="/?by=theo"'); // All keeps the person
    expect(html).toContain('href="/?kind=news&amp;by=theo"');
    expect(html).toContain('href="/?kind=try"'); // active person chip toggles off
    expect(html).toMatch(/href="\/\?kind=try&amp;by=theo" aria-current="true"/);
  });

  it("renders empty states", () => {
    expect(home({ days: [] })).toContain("No items yet.");
    expect(home({ days: [] })).toContain("No brief for this month yet.");
    expect(home({ days: [], filter: { kind: "news", by: null } })).toContain("No items match this filter.");
    expect(renderArchiveIndex({ ...layout, path: "/archive", months: [] })).toContain("The archive is empty.");
    expect(renderArchiveMonth({ ...layout, path: "/archive/2026-09", month: "2026-09", brief: null, days: [] })).toContain(
      "No items this month.",
    );
    expect(renderStatus({ ...layout, path: "/status", runs: [], refresh: null })).toContain("No runs yet.");
    expect(renderSources({ ...layout, path: "/sources", accounts: [], repos: [] })).toContain("The watch list is empty.");
  });

  it("formats dates and times in Copenhagen", () => {
    const html = home();
    expect(html).toContain("4 Nov 2026, 03:41");
    expect(html).toContain('<span class="dow">Wed</span> <span class="dm">4 Nov</span>');
  });

  it("renders the 404 with the escaped path", () => {
    const html = renderNotFound({ ...layout, title: "Page not found", path: "/x/<y>" });
    expect(html).toContain("<code>/x/&lt;y&gt;</code>");
    expect(html).toContain("<title>Page not found | tech-update</title>");
  });
});
