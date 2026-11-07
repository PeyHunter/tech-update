import { describe, expect, it } from "vitest";
import { tokenMatches } from "./auth.js";
import { openDb } from "./db/migrate.js";
import { normalizeUrl } from "./ingest.js";
import { escapeXml } from "./routes/rss.js";
import { addDays, monthOf, today, windowStart } from "./time.js";

describe("normalizeUrl", () => {
  it.each([
    ["https://Example.COM/Path/", "https://example.com/Path"],
    ["https://example.com/", "https://example.com"],
    ["https://example.com/a?utm_source=x&utm_Medium=y&id=3#frag", "https://example.com/a?id=3"],
    ["https://example.com/a?id=3&UTM_campaign=z", "https://example.com/a?id=3"],
    ["https://news.ycombinator.com/item?id=42", "https://news.ycombinator.com/item?id=42"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it("treats utm and trailing-slash variants as the same URL", () => {
    expect(normalizeUrl("https://ACME.dev/agent/?utm_source=hn#top")).toBe(normalizeUrl("https://acme.dev/agent"));
  });
});

describe("time", () => {
  it("uses the Copenhagen calendar date", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Copenhagen (UTC+1 in winter).
    expect(today(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
    // Summer time: UTC+2.
    expect(today(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });

  it("computes the window start and month", () => {
    expect(windowStart(new Date("2026-11-04T12:00:00Z"))).toBe("2026-10-05");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(monthOf("2026-11-04")).toBe("2026-11");
  });
});

describe("misc", () => {
  it("compares tokens", () => {
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abc", "abcd")).toBe(false);
  });

  it("escapes XML", () => {
    expect(escapeXml(`<a href="x">'&'</a>\u0001`)).toBe("&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
  });

  it("migrates idempotently and seeds the watch list", () => {
    const db = openDb(":memory:");
    expect(db.pragma("user_version", { simple: true })).toBe(2);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    const handles = (db.prepare("SELECT handle FROM accounts").all() as { handle: string }[]).map((r) => r.handle);
    expect(handles).toHaveLength(12);
    expect(handles).toContain("caseynewton");
    expect(handles.every((h) => h === h.toLowerCase())).toBe(true);
  });
});
