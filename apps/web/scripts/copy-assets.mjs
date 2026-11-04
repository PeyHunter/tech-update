// Copies non-TS assets from src/views into dist/views after tsc.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "src", "views");
const to = join(root, "dist", "views");

if (existsSync(from)) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).filter((n) => n.endsWith(".css"))) {
    copyFileSync(join(from, name), join(to, name));
    console.log(`copied src/views/${name} -> dist/views/${name}`);
  }
}
