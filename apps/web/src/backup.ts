import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { addDays, today } from "./time.js";

export const KEEP_DAYS = 14;
const NAME_RE = /^tech-update-(\d{4}-\d{2}-\d{2})\.db$/;

/** Online backup of the live DB to backupDir/tech-update-YYYY-MM-DD.db, then prune old copies. */
export async function runBackup(opts: { dataDir: string; backupDir: string; now?: Date }): Promise<{ file: string; deleted: string[] }> {
  const day = today(opts.now);
  mkdirSync(opts.backupDir, { recursive: true });
  const file = join(opts.backupDir, `tech-update-${day}.db`);
  const db = new Database(join(opts.dataDir, "tech-update.db"), { readonly: true, fileMustExist: true });
  try {
    await db.backup(file);
  } finally {
    db.close();
  }
  const cutoff = addDays(day, -KEEP_DAYS);
  const deleted: string[] = [];
  for (const name of readdirSync(opts.backupDir)) {
    const date = NAME_RE.exec(name)?.[1];
    if (date && date < cutoff) {
      rmSync(join(opts.backupDir, name));
      deleted.push(name);
    }
  }
  return { file, deleted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup({ dataDir: process.env.DATA_DIR || "/data", backupDir: process.env.BACKUP_DIR || "/backups" })
    .then(({ file, deleted }) => console.log(`backup written to ${file}; deleted ${deleted.length} old backup(s)`))
    .catch((err: unknown) => {
      console.error("backup failed:", err);
      process.exit(1);
    });
}
