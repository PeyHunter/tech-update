import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { Config } from "./config.js";
import type { DB } from "./db/migrate.js";
import { adminRoutes } from "./routes/admin.js";
import { apiRoutes } from "./routes/api.js";
import { internalRoutes } from "./routes/internal.js";
import { notFoundPage, publicRoutes } from "./routes/public.js";
import { rssRoutes } from "./routes/rss.js";

export type Deps = {
  db: DB;
  config: Pick<Config, "ingestToken" | "adminToken" | "publicUrl">;
  stylesCss: string | null;
};

/** dist/views/styles.css (copied by scripts/copy-assets.mjs) or, when running from src, src/views/styles.css. */
export function loadStyles(): string | null {
  for (const rel of ["./views/styles.css", "../src/views/styles.css"]) {
    const file = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  return null;
}

export function createPublicApp(deps: Deps): Hono {
  const app = new Hono();
  app.route("/", apiRoutes(deps));
  app.route("/", rssRoutes(deps));
  app.route("/", adminRoutes(deps));
  app.route("/", publicRoutes(deps));
  app.notFound((c) =>
    c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.html(notFoundPage(deps, c.req.path), 404),
  );
  app.onError((err, c) => {
    console.error(err);
    return c.req.path.startsWith("/api/") ? c.json({ error: "internal error" }, 500) : c.text("internal error", 500);
  });
  return app;
}

export function createInternalApp(deps: Deps): Hono {
  const app = new Hono();
  app.route("/", internalRoutes(deps));
  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });
  return app;
}
