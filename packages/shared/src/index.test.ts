import { describe, expect, it } from "vitest";
import { parseResultFile } from "./index.js";

function item(over: Record<string, unknown> = {}) {
  return {
    slug: "2026-11-02-example-tool",
    date: "2026-11-02",
    kind: "try",
    title: "Example tool ships",
    summary: "A short summary.",
    why: "Why it matters.",
    how_to_try: "npm i example",
    heat: 4,
    links: [{ label: "Announcement", url: "https://example.com/post", is_primary: true }],
    mentions: [{ account_handle: "theo", source: "x", url: "https://x.com/theo/status/1" }],
    ...over,
  };
}

function point(over: Record<string, unknown> = {}) {
  return { title: "A point", text: "Some text.", item_slugs: ["2026-11-02-example-tool"], ...over };
}

function file(over: Record<string, unknown> = {}) {
  return {
    run: { started_at: "2026-11-03T02:00:00Z", backend: "claude-code", notes: "ok" },
    items: [item()],
    brief: { headline: "The month", period_label: "3 Oct – 2 Nov 2026", points: Array.from({ length: 5 }, () => point()) },
    rejected: [{ title: "Hot take", reason: "opinion thread" }],
    ...over,
  };
}

function errorsOf(json: unknown): string[] {
  const r = parseResultFile(json);
  if (r.ok) throw new Error("expected failure");
  return r.errors;
}

describe("parseResultFile", () => {
  it("accepts a valid file", () => {
    const r = parseResultFile(file());
    expect(r.ok).toBe(true);
  });

  it("rejects a title over 90 chars with a readable error", () => {
    const items = [item({ slug: "2026-11-02-a" }), item({ slug: "2026-11-02-b" }), item({ title: "x".repeat(91) })];
    expect(errorsOf(file({ items }))).toContain("items[2].title: too long (max 90)");
  });

  it("rejects a summary over 300 chars", () => {
    expect(errorsOf(file({ items: [item({ summary: "x".repeat(301) })] }))).toContain(
      "items[0].summary: too long (max 300)",
    );
  });

  it("rejects an item without a primary link", () => {
    const links = [{ label: "Post", url: "https://example.com", is_primary: false }];
    expect(errorsOf(file({ items: [item({ links })] }))).toContain("items[0].links: needs a primary https:// link");
  });

  it("rejects an http:// primary link", () => {
    const links = [{ label: "Post", url: "http://example.com", is_primary: true }];
    expect(errorsOf(file({ items: [item({ links })] }))).toContain("items[0].links[0].url: must be an https:// URL");
  });

  it("rejects a try item without how_to_try", () => {
    expect(errorsOf(file({ items: [item({ how_to_try: null })] }))).toContain(
      "items[0].how_to_try: required when kind is try",
    );
  });

  it.each([4, 8])("rejects a brief with %i points", (n) => {
    const brief = { headline: "h", period_label: "p", points: Array.from({ length: n }, () => point()) };
    expect(errorsOf(file({ brief }))).toContain(n < 5 ? "brief.points: too few (min 5)" : "brief.points: too many (max 7)");
  });

  it("rejects a brief point with no item_slugs", () => {
    const points = [point({ item_slugs: [] }), point(), point(), point(), point()];
    expect(errorsOf(file({ brief: { headline: "h", period_label: "p", points } }))).toContain(
      "brief.points[0].item_slugs: too few (min 1)",
    );
  });

  it("clamps heat 7 to 5", () => {
    const r = parseResultFile(file({ items: [item({ heat: 7 })] }));
    expect(r.ok && r.value.items[0]?.heat).toBe(5);
  });

  it("rejects heat 1", () => {
    expect(errorsOf(file({ items: [item({ heat: 1 })] }))).toContain("items[0].heat: too small (min 2)");
  });

  it("rejects a slug whose date prefix differs from date", () => {
    expect(errorsOf(file({ items: [item({ date: "2026-11-03" })] }))).toContain(
      "items[0].slug: date prefix must match date 2026-11-03",
    );
  });

  it("rejects duplicate slugs", () => {
    expect(errorsOf(file({ items: [item(), item()] }))).toContain(
      "items[1].slug: duplicate slug 2026-11-02-example-tool",
    );
  });

  it("accepts brief null", () => {
    expect(parseResultFile(file({ brief: null })).ok).toBe(true);
  });

  it("accepts empty items", () => {
    expect(parseResultFile(file({ items: [], brief: null })).ok).toBe(true);
  });

  it("normalizes mention handles", () => {
    const mentions = [{ account_handle: "@Theo", source: "x", url: "https://x.com/theo/status/1" }];
    const r = parseResultFile(file({ items: [item({ mentions })] }));
    expect(r.ok && r.value.items[0]?.mentions[0]?.account_handle).toBe("theo");
  });

  it.each([
    "https://hn.algolia.com/api/v1/search?tags=front_page",
    "https://hn.algolia.com/api/v1/search_by_date?query=AI",
    "https://github.com/trending?since=weekly",
    "https://github.com/trending/typescript",
    "https://x.com/search?q=claude",
    "https://news.ycombinator.com/",
    "https://news.ycombinator.com/news",
    "https://www.reddit.com/r/LocalLLaMA/search?q=kimi",
  ])("rejects listing mention url %s", (url) => {
    const mentions = [{ source: "hn", url }];
    expect(errorsOf(file({ items: [item({ mentions })] }))).toEqual([
      "items[0].mentions[0].url: must link to one post, not a listing page",
    ]);
  });

  it.each([
    "https://news.ycombinator.com/item?id=123",
    "https://github.com/anthropics/skills",
    "https://github.com/acme/searchlight/issues/4",
    "https://x.com/theo/status/1",
    "https://www.youtube.com/watch?v=abc",
  ])("accepts single-post mention url %s", (url) => {
    expect(parseResultFile(file({ items: [item({ mentions: [{ source: "hn", url }] })] })).ok).toBe(true);
  });
});
