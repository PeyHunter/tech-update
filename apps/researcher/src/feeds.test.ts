import { describe, expect, it } from "vitest";
import { collectFeeds, parseFeedXml, parseFxStatuses } from "./feeds.js";

const SINCE = new Date("2026-11-05T00:00:00Z");
const NOW = new Date("2026-11-07T22:00:00Z");

const fx = (over: Record<string, unknown>) => ({
  url: "https://x.com/theo/status/1",
  text: "Benchmarks are an art form",
  created_timestamp: Date.parse("2026-11-07T20:00:00Z") / 1000,
  likes: 120,
  views: 9000,
  author: { screen_name: "theo" },
  ...over,
});

describe("parseFxStatuses", () => {
  it("keeps posts inside the window and marks reposts and replies", () => {
    const posts = parseFxStatuses(
      "theo",
      {
        code: 200,
        results: [
          fx({}),
          fx({ url: "https://x.com/joel/status/2", author: { screen_name: "joel" } }),
          fx({ url: "https://x.com/theo/status/3", replying_to: { screen_name: "dhh" } }),
          fx({ url: "https://x.com/theo/status/4", created_timestamp: Date.parse("2026-11-01T00:00:00Z") / 1000 }),
        ],
      },
      SINCE,
    );
    expect(posts.map((p) => p.url)).toEqual(["https://x.com/theo/status/1", "https://x.com/joel/status/2", "https://x.com/theo/status/3"]);
    expect(posts[0]).toMatchObject({ source: "x", likes: 120, views: 9000, date: "2026-11-07T20:00:00.000Z" });
    expect(posts[1]!.repost_of).toBe("joel");
    expect(posts[2]!.reply_to).toBe("dhh");
  });
});

describe("parseFeedXml", () => {
  it("reads RSS items", () => {
    const xml = `<rss><channel><title>Hard Fork</title>
      <item><title><![CDATA[AI &amp; jobs]]></title><link>https://example.com/ep1</link><pubDate>Fri, 6 Nov 2026 11:00:00 +0000</pubDate><description>&lt;p&gt;We talk.&lt;/p&gt;</description></item>
      <item><title>Old</title><link>https://example.com/old</link><pubDate>Fri, 1 Oct 2026 11:00:00 +0000</pubDate></item>
    </channel></rss>`;
    const posts = parseFeedXml(xml, { kind: "podcast", label: "Hard Fork", url: "" }, SINCE);
    expect(posts).toEqual([
      { source: "podcast", feed: "Hard Fork", date: "2026-11-06T11:00:00.000Z", url: "https://example.com/ep1", text: "AI & jobs — We talk." },
    ]);
  });

  it("reads Atom entries (YouTube and GitHub)", () => {
    const xml = `<feed><title>Theo</title>
      <entry><title>How Claude fixes its own code</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/><published>2026-11-06T23:00:39+00:00</published><media:group><media:description>A video.</media:description></media:group></entry>
      <entry><title type="html">vojtaholik pushed good-a11y</title><link type="text/html" rel="alternate" href="https://github.com/vojtaholik/good-a11y/compare/a...b"/><published>2026-11-06 14:29:34 UTC</published></entry>
    </feed>`;
    const posts = parseFeedXml(xml, { kind: "youtube", label: "Theo", url: "" }, SINCE);
    expect(posts.map((p) => [p.url, p.date])).toEqual([
      ["https://www.youtube.com/watch?v=abc", "2026-11-06T23:00:39.000Z"],
      ["https://github.com/vojtaholik/good-a11y/compare/a...b", "2026-11-06T14:29:34.000Z"],
    ]);
    expect(posts[0]!.text).toBe("How Claude fixes its own code — A video.");
  });
});

describe("collectFeeds", () => {
  it("retries a flaky X 404 and records feeds that fail without throwing", async () => {
    let xCalls = 0;
    const fetchMock = (async (url: string) => {
      if (url.includes("api.fxtwitter.com")) {
        xCalls++;
        return xCalls === 1 ? Response.json({ code: 404, results: [] }) : Response.json({ code: 200, results: [fx({})] });
      }
      return new Response("nope", { status: 500 });
    }) as unknown as typeof fetch;
    const out = await collectFeeds([{ handle: "theo", name: "Theo", description: "", priority: "high" }], SINCE, NOW, {
      fetch: fetchMock,
      sleep: async () => {},
    });
    expect(xCalls).toBe(2);
    expect(out.people[0]!.posts.map((p) => p.url)).toEqual(["https://x.com/theo/status/1"]);
    expect(out.people[0]!.errors.length).toBe(3);
  });
});
