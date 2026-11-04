import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { openDb } from "./db/migrate.js";
import { createInternalApp, createPublicApp, loadStyles, type Deps } from "./server.js";

const config = loadConfig();
const db = openDb(config.dbFile);
const deps: Deps = { db, config, stylesCss: loadStyles() };

if (!config.ingestToken) console.warn("INGEST_TOKEN is not set: internal endpoints return 503");
if (!config.adminToken) console.warn("ADMIN_TOKEN is not set: admin endpoints return 503");

const servers: ServerType[] = [
  serve({ fetch: createPublicApp(deps).fetch, port: config.port }, (i) => console.log(`public listening on :${i.port}`)),
  serve({ fetch: createInternalApp(deps).fetch, port: config.internalPort }, (i) =>
    console.log(`internal listening on :${i.port}`),
  ),
];

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  let open = servers.length;
  for (const s of servers) {
    s.close(() => {
      if (--open === 0) {
        db.close();
        process.exit(0);
      }
    });
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
