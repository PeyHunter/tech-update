import { Hono } from "hono";
import { z } from "zod";
import type { Deps } from "../server.js";
import { bearer } from "../auth.js";
import * as repo from "../db/repo.js";

const accountBody = z.object({
  handle: z
    .string()
    .trim()
    .transform((s) => s.replace(/^@/, "").toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9_]{1,30}$/)),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).optional(),
  priority: z.enum(["high", "normal"]).optional(),
  active: z.boolean(),
});

export function adminRoutes({ db, config }: Deps): Hono {
  const app = new Hono();
  app.use("/api/admin/*", bearer(config.adminToken));

  for (const action of ["hide", "unhide"] as const) {
    app.post(`/api/admin/items/:slug/${action}`, (c) => {
      const slug = c.req.param("slug");
      const status = action === "hide" ? "hidden" : "published";
      return repo.setItemStatus(db, slug, status) ? c.json({ slug, status }) : c.json({ error: "no such item" }, 404);
    });
  }

  app.post("/api/admin/accounts", async (c) => {
    const parsed = accountBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues.map((i) => i.message) }, 400);
    const b = parsed.data;
    const existing = repo.getAccount(db, b.handle);
    const name = b.name ?? existing?.name;
    if (!name) return c.json({ error: "name is required for a new account" }, 400);
    const account: repo.AccountRow = {
      handle: b.handle,
      name,
      description: b.description ?? existing?.description ?? "",
      priority: b.priority ?? existing?.priority ?? "normal",
      active: b.active ? 1 : 0,
    };
    repo.upsertAccount(db, account);
    return c.json({ ...account, active: b.active }, existing ? 200 : 201);
  });

  return app;
}
