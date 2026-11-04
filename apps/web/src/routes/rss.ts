import { Hono } from "hono";
import type { Deps } from "../server.js";
import * as repo from "../db/repo.js";
import { SITE_TITLE } from "../viewmodels.js";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Control characters other than tab/newline/CR are illegal in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function rssXml(items: repo.ItemRow[], publicUrl: string): string {
  const entries = items
    .map((i) => {
      const link = `${publicUrl}/item/${encodeURIComponent(i.slug)}`;
      return [
        "    <item>",
        `      <title>${escapeXml(i.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${new Date(i.created_at).toUTCString()}</pubDate>`,
        `      <category>${i.kind}</category>`,
        `      <description>${escapeXml(i.summary)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${SITE_TITLE}</title>
    <link>${escapeXml(publicUrl)}/</link>
    <description>New AI tools and news worth knowing, every night.</description>
    <language>en</language>
${entries}
  </channel>
</rss>
`;
}

export function rssRoutes({ db, config }: Deps): Hono {
  const app = new Hono();
  app.get("/rss.xml", (c) =>
    c.body(rssXml(repo.listPublishedItems(db, { order: "newest", limit: 50 }), config.publicUrl), 200, {
      "Content-Type": "application/rss+xml; charset=utf-8",
    }),
  );
  return app;
}
