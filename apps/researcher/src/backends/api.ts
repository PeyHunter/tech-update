import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Backend } from "./index.js";
import { promptFor } from "./index.js";

export const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_CONTINUATIONS = 10;

const API_NOTE = [
  "You are running through the Messages API, not Claude Code.",
  "Your tools are web_search and web_fetch. There is no Read or Write tool:",
  "state.json is included below, and instead of writing result.json, reply with its full content",
  "as your final message, in one ```json fenced block, and nothing after it.",
].join(" ");

/** Pulls the JSON object out of the final text: a ```json fence if present, else the outermost braces. */
export function extractJson(text: string): string {
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  if (fences.length) return fences[fences.length - 1]![1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("api backend: final message has no JSON");
  return text.slice(start, end + 1);
}

export function createApiBackend(env: NodeJS.ProcessEnv): Backend {
  return {
    async run({ outDir, promptPath, statePath }) {
      if (!env.ANTHROPIC_API_KEY) throw new Error("api backend needs ANTHROPIC_API_KEY (Secret researcher-auth)");
      const model = env.RESEARCHER_MODEL || DEFAULT_MODEL;
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 35 * 60 * 1000 });
      const system = promptFor(await readFile(promptPath, "utf8"), outDir);
      const state = await readFile(statePath, "utf8");
      const feeds = await readFile(join(outDir, "feeds.json"), "utf8").catch(() => null);

      const messages: Anthropic.Beta.BetaMessageParam[] = [
        { role: "user", content: `${API_NOTE}\n\nstate.json:\n\n\`\`\`json\n${state}\n\`\`\`${feeds ? `\n\nfeeds.json:\n\n\`\`\`json\n${feeds}\n\`\`\`` : ""}` },
      ];
      let message: Anthropic.Beta.BetaMessage | undefined;
      let inputTokens = 0;
      let outputTokens = 0;
      for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
        message = await client.beta.messages
          .stream({
            model,
            max_tokens: 64000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            output_config: { effort: "high" },
            system,
            tools: [
              { type: "web_search_20260209", name: "web_search", max_uses: 60 },
              { type: "web_fetch_20260209", name: "web_fetch", max_uses: 60 },
            ],
            messages,
          })
          .finalMessage();
        inputTokens += message.usage.input_tokens;
        outputTokens += message.usage.output_tokens;
        // The server's tool loop paused; resend with the partial turn and it resumes.
        if (message.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: message.content });
      }
      if (!message) throw new Error("api backend: no response");
      if (message.stop_reason === "refusal") throw new Error("api backend: model refused");
      if (message.stop_reason === "pause_turn") throw new Error(`api backend: still paused after ${MAX_CONTINUATIONS} continuations`);
      if (message.stop_reason === "max_tokens") throw new Error("api backend: hit max_tokens before finishing");

      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      await writeFile(join(outDir, "result.json"), extractJson(text));
      return { notes: `api: ${message.model}, ${inputTokens} in / ${outputTokens} out tokens.` };
    },
  };
}
