import { Hono } from "hono";
import type { Deps } from "../server.js";
import * as repo from "../db/repo.js";
import * as vm from "../viewmodels.js";
import {
  renderArchiveIndex,
  renderArchiveMonth,
  renderHome,
  renderItem,
  renderNotFound,
  renderSources,
  renderStatus,
} from "../views/index.js";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function publicRoutes(deps: Deps): Hono {
  const { db, stylesCss } = deps;
  const app = new Hono();
  const notFound = (path: string) => notFoundPage(deps, path);

  app.get("/", (c) => c.html(renderHome(vm.homeModel(db, { path: c.req.path, kind: c.req.query("kind"), by: c.req.query("by") }))));

  app.get("/item/:slug", (c) => {
    const model = vm.itemModel(db, c.req.param("slug"), c.req.path);
    return model ? c.html(renderItem(model)) : c.html(notFound(c.req.path), 404);
  });

  app.get("/archive", (c) => c.html(renderArchiveIndex(vm.archiveIndexModel(db, c.req.path))));

  app.get("/archive/:month", (c) => {
    const month = c.req.param("month");
    const model = MONTH_RE.test(month) ? vm.archiveMonthModel(db, month, c.req.path) : null;
    return model ? c.html(renderArchiveMonth(model)) : c.html(notFound(c.req.path), 404);
  });

  app.get("/sources", (c) => c.html(renderSources(vm.sourcesModel(db, c.req.path))));
  app.get("/status", (c) => c.html(renderStatus(vm.statusModel(db, c.req.path, c.req.query("refresh")))));

  app.post("/refresh", async (c) => {
    const outcome = deps.refresher ? await deps.refresher.trigger(repo.lastSuccessAt(db)) : "unavailable";
    return c.redirect(`/status?refresh=${outcome}`, 303);
  });

  app.get("/styles.css", (c) => {
    if (stylesCss === null) return c.text("not found", 404);
    c.header("Cache-Control", "public, max-age=300");
    return c.body(stylesCss, 200, { "Content-Type": "text/css; charset=utf-8" });
  });

  app.get("/healthz", (c) => c.text("ok"));
  app.get("/readyz", (c) => {
    try {
      if (repo.ping(db)) return c.text("ok");
    } catch {
      // fall through
    }
    return c.text("database unavailable", 503);
  });

  return app;
}

export function notFoundPage({ db }: Deps, path: string): string {
  return renderNotFound(vm.layout(db, path, `Not found · ${vm.SITE_TITLE}`));
}
