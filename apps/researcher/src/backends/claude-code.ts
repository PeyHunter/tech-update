import { spawn as nodeSpawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { Backend } from "./index.js";
import { promptFor } from "./index.js";

const TIMEOUT_MS = 35 * 60 * 1000;
const TOOLS = ["WebSearch", "WebFetch", "Write", "Read"];

type ClaudeResult = { type?: string; result?: string; total_cost_usd?: number; num_turns?: number; is_error?: boolean };

export function claudeArgs(prompt: string): string[] {
  return [
    "-p",
    prompt,
    // Only these four tools exist in the session (no Bash, no Edit, no MCP).
    "--tools",
    TOOLS.join(","),
    "--allowedTools",
    TOOLS.join(" "),
    // Anything not pre-approved is denied instead of waiting for a prompt nobody answers.
    "--permission-mode",
    "dontAsk",
    // Confines Read/Write to the cwd (OUT_DIR) and ignores user/project settings files.
    "--restricted",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--output-format",
    "json",
  ];
}

function parseOutput(stdout: string): ClaudeResult {
  const parsed: unknown = JSON.parse(stdout);
  if (Array.isArray(parsed)) {
    const last = [...parsed].reverse().find((m) => m && typeof m === "object" && m.type === "result");
    if (!last) throw new Error("claude output has no result message");
    return last as ClaudeResult;
  }
  return parsed as ClaudeResult;
}

export function createClaudeCodeBackend(env: NodeJS.ProcessEnv, spawn: typeof nodeSpawn = nodeSpawn): Backend {
  return {
    async run({ outDir, promptPath }) {
      if (!env.CLAUDE_CODE_OAUTH_TOKEN && !env.ANTHROPIC_API_KEY) {
        throw new Error("claude-code backend needs CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY (Secret researcher-auth)");
      }
      const prompt = promptFor(await readFile(promptPath, "utf8"), outDir);
      const child = spawn(env.CLAUDE_BIN || "claude", claudeArgs(prompt), {
        cwd: outDir,
        env,
        stdio: ["ignore", "pipe", "inherit"],
      });

      let stdout = "";
      child.stdout!.setEncoding("utf8");
      child.stdout!.on("data", (chunk: string) => (stdout += chunk));

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
      }, TIMEOUT_MS);

      const code = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      }).finally(() => clearTimeout(timer));

      if (timedOut) throw new Error(`claude timed out after ${TIMEOUT_MS / 60000} min`);
      let out: ClaudeResult;
      try {
        out = parseOutput(stdout);
      } catch {
        throw new Error(`claude exited ${code} without JSON output: ${stdout.slice(0, 500)}`);
      }
      if (out.is_error || code !== 0) {
        throw new Error(`claude failed (exit ${code}): ${String(out.result ?? "").slice(0, 500)}`);
      }
      const cost = typeof out.total_cost_usd === "number" ? `$${out.total_cost_usd.toFixed(2)}` : "n/a";
      return { notes: `claude-code: ${out.num_turns ?? "?"} turns, cost ${cost}. ${String(out.result ?? "").slice(0, 300)}` };
    },
  };
}
