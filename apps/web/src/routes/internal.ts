import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { WATCHED_REPOS, type StateResponse } from "@tech-update/shared";
import type { Deps } from "../server.js";
import { bearer } from "../auth.js";
import * as repo from "../db/repo.js";
import { ingest, recordFailedRun } from "../ingest.js";
import { addDays, today, windowStart } from "../time.js";

const failedRunBody = z.object({
  started_at: z.iso.datetime({ offset: true }),
  backend: z.string().trim().min(1).max(40),
  error: z.string().trim().min(1).max(10_000),
});

export function internalRoutes({ db, config }: Deps): Hono {
  const app = new Hono();
  app.use("/api/internal/*", bearer(config.ingestToken));
  app.use("/api/internal/*", bodyLimit({ maxSize: 5 * 1024 * 1024 }));

  app.get("/api/internal/state", (c) => {
    const state: StateResponse = {
      last_success_at: repo.lastSuccessAt(db),
      items: repo.stateItems(db, windowStart()),
      accounts: repo.listAccounts(db).map(({ handle, name, description, priority }) => ({ handle, name, description, priority })),
      repos: WATCHED_REPOS,
      recent_updates: repo
        .listUpdates(db, addDays(today(), -7))
        .map(({ account_handle, date, url }) => ({ account_handle, date, url })),
    };
    return c.json(state);
  });

  app.post("/api/internal/ingest", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      const run_id = recordFailedRun(db, { started_at: new Date().toISOString(), backend: "unknown", error: "body is not valid JSON" });
      return c.json({ run_id, errors: ["body is not valid JSON"] }, 400);
    }
    const result = ingest(db, json);
    return result.ok ? c.json(result.response) : c.json({ run_id: result.run_id, errors: result.errors }, 400);
  });

  app.post("/api/internal/runs/failed", async (c) => {
    const parsed = failedRunBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues.map((i) => i.message) }, 400);
    return c.json({ run_id: recordFailedRun(db, parsed.data) }, 201);
  });

  return app;
}
