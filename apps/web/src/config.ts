import { join } from "node:path";

export type Config = {
  port: number;
  internalPort: number;
  dataDir: string;
  dbFile: string;
  ingestToken: string | undefined;
  adminToken: string | undefined;
  publicUrl: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.DATA_DIR || "/data";
  return {
    port: Number(env.PORT || 3000),
    internalPort: Number(env.INTERNAL_PORT || 3001),
    dataDir,
    dbFile: join(dataDir, "tech-update.db"),
    ingestToken: env.INGEST_TOKEN || undefined,
    adminToken: env.ADMIN_TOKEN || undefined,
    publicUrl: (env.PUBLIC_URL || "https://tech-update.peytonhunter.com").replace(/\/+$/, ""),
  };
}
