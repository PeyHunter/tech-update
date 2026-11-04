import { Hono } from "hono";
import type { Deps } from "../server.js";
import * as repo from "../db/repo.js";
import * as vm from "../viewmodels.js";
import { windowStart } from "../time.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function apiRoutes({ db }: Deps): Hono {
  const app = new Hono();

  app.get("/api/items", (c) => {
    const since = c.req.query("since") || windowStart();
    if (!DATE_RE.test(since)) return c.json({ error: "since must be YYYY-MM-DD" }, 400);
    const kindParam = c.req.query("kind");
    const kind = vm.parseKind(kindParam);
    if (kindParam && !kind) return c.json({ error: "kind must be news or try" }, 400);
    const items = vm.toItemViews(db, repo.listPublishedItems(db, { since, kind }));
    return c.json({ since, items });
  });

  app.get("/api/brief", (c) => {
    const brief = vm.currentBrief(db);
    return brief ? c.json(brief) : c.json({ error: "no brief yet" }, 404);
  });

  return app;
}
