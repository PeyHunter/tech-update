import { createApiBackend } from "./api.js";
import { createClaudeCodeBackend } from "./claude-code.js";

export type BackendContext = { outDir: string; promptPath: string; statePath: string };
export type Backend = { run(ctx: BackendContext): Promise<{ notes: string }> };
export type BackendName = "claude-code" | "api";

export function backendName(value: string | undefined): BackendName {
  const name = value || "claude-code";
  if (name === "claude-code" || name === "api") return name;
  throw new Error(`unknown RESEARCHER_BACKEND "${name}" (expected claude-code or api)`);
}

export function createBackend(name: BackendName, env: NodeJS.ProcessEnv): Backend {
  return name === "api" ? createApiBackend(env) : createClaudeCodeBackend(env);
}

/** PROMPT.md names /out; point it at the real OUT_DIR when running elsewhere. */
export function promptFor(promptText: string, outDir: string): string {
  const dir = outDir.replace(/\/+$/, "");
  return dir === "/out" ? promptText : promptText.replaceAll("/out/", `${dir}/`);
}
