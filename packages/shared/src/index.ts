import { z } from "zod";

export const KINDS = ["news", "try"] as const;
export const SOURCES = ["x", "hn", "github", "arxiv", "lab", "newsletter", "youtube"] as const;
export const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const text = (max: number) => z.string().trim().min(1).max(max);
const httpsUrl = z.url({ protocol: /^https$/, error: "must be an https:// URL" });
const slug = z.string().regex(SLUG_RE, { error: "must look like YYYY-MM-DD-words-with-dashes" });

export const linkSchema = z.object({
  label: text(60),
  url: httpsUrl,
  is_primary: z.boolean(),
});

const handle = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, "").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9_]{1,30}$/, { error: "must be a handle: letters, digits, underscore" }));

export const mentionSchema = z.object({
  account_handle: handle.nullable().optional(),
  source: z.enum(SOURCES),
  url: httpsUrl,
  metric: z.string().trim().nullable().optional(),
});

export const itemSchema = z
  .object({
    slug,
    date: z.iso.date({ error: "must be a date YYYY-MM-DD" }),
    kind: z.enum(KINDS),
    title: text(90),
    summary: text(300),
    why: text(400),
    how_to_try: z.string().trim().nullable().default(null),
    // The researcher may overshoot; anything above 5 is treated as 5.
    heat: z.int().min(2).transform((n) => Math.min(n, 5) as 2 | 3 | 4 | 5),
    links: z.array(linkSchema).min(1),
    mentions: z.array(mentionSchema).default([]),
  })
  .superRefine((item, ctx) => {
    if (!item.links.some((l) => l.is_primary && l.url.startsWith("https://"))) {
      ctx.addIssue({ code: "custom", path: ["links"], message: "needs a primary https:// link" });
    }
    if (item.kind === "try" && !item.how_to_try) {
      ctx.addIssue({ code: "custom", path: ["how_to_try"], message: "required when kind is try" });
    }
    if (!item.slug.startsWith(`${item.date}-`)) {
      ctx.addIssue({ code: "custom", path: ["slug"], message: `date prefix must match date ${item.date}` });
    }
  });

export const briefPointSchema = z.object({
  title: text(90),
  text: text(600),
  item_slugs: z.array(slug).min(1),
});

export const briefSchema = z.object({
  headline: text(160),
  period_label: text(60),
  points: z.array(briefPointSchema).min(5).max(7),
});

/** Something one followed person posted, shipped or said, in one or two plain sentences. */
export const updateSchema = z.object({
  account_handle: handle,
  date: z.iso.date({ error: "must be a date YYYY-MM-DD" }),
  source: z.enum(SOURCES),
  text: text(280),
  url: httpsUrl,
});

export const resultFileSchema = z.object({
  run: z.object({
    started_at: z.iso.datetime({ offset: true, error: "must be an ISO datetime" }),
    backend: z.enum(["claude-code", "api", "manual"]),
    notes: z.string().optional(),
  }),
  items: z.array(itemSchema).superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      if (seen.has(item.slug)) {
        ctx.addIssue({ code: "custom", path: [i, "slug"], message: `duplicate slug ${item.slug}` });
      }
      seen.add(item.slug);
    });
  }),
  brief: briefSchema.nullable(),
  updates: z.array(updateSchema).max(60).default([]),
  rejected: z.array(z.object({ title: z.string(), reason: z.string() })).default([]),
});

export type ResultFile = z.infer<typeof resultFileSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Link = z.infer<typeof linkSchema>;
export type Update = z.infer<typeof updateSchema>;
export type Mention = z.infer<typeof mentionSchema>;
export type Brief = z.infer<typeof briefSchema>;
export type BriefPoint = z.infer<typeof briefPointSchema>;
export type Kind = (typeof KINDS)[number];
export type Source = (typeof SOURCES)[number];

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === "number") return `${acc}[${key}]`;
    return acc ? `${acc}.${String(key)}` : String(key);
  }, "");
}

function formatMessage(issue: z.core.$ZodIssue): string {
  if (issue.code === "too_big") {
    const what = issue.origin === "array" ? "too many" : "too long";
    return `${what} (max ${issue.maximum})`;
  }
  if (issue.code === "too_small") {
    if (issue.origin === "string" && issue.minimum === 1) return "required";
    const what = issue.origin === "array" ? "too few" : issue.origin === "string" ? "too short" : "too small";
    return `${what} (min ${issue.minimum})`;
  }
  return issue.message;
}

export function parseResultFile(json: unknown): { ok: true; value: ResultFile } | { ok: false; errors: string[] } {
  const result = resultFileSchema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = formatPath(issue.path);
      return path ? `${path}: ${formatMessage(issue)}` : formatMessage(issue);
    }),
  };
}

export type StateResponse = {
  last_success_at: string | null;
  items: { slug: string; title: string; date: string; urls: string[] }[];
  accounts: { handle: string; name: string; description: string; priority: "high" | "normal" }[];
  repos: WatchedRepo[];
  /** People updates already on the site from the last 7 days, so the researcher does not repeat them. */
  recent_updates: { account_handle: string; date: string; url: string }[];
};

/** GitHub places the researcher checks every run, next to the X watch list. `check` is a GitHub API URL it can WebFetch. */
export type WatchedRepo = { name: string; owner: string; description: string; url: string; check: string };
export const WATCHED_REPOS: WatchedRepo[] = [
  {
    name: "pstack",
    owner: "poteto",
    description: "Lauren Tan's agent skill pack in the Cursor plugins repo",
    url: "https://github.com/cursor/plugins/tree/main/pstack",
    check: "https://api.github.com/repos/cursor/plugins/commits?path=pstack&per_page=30",
  },
  {
    name: "tstack",
    owner: "theo",
    description: "Theo's agent skill pack",
    url: "https://github.com/t3dotgg/tstack",
    check: "https://api.github.com/repos/t3dotgg/tstack/commits?per_page=30",
  },
  {
    name: "Matt Pocock on GitHub",
    owner: "mattpocockuk",
    description: "Matt's repos, such as skills and sandcastle",
    url: "https://github.com/mattpocock",
    check: "https://api.github.com/users/mattpocock/repos?sort=pushed&per_page=15",
  },
  {
    name: "Lauren Tan on GitHub",
    owner: "poteto",
    description: "Lauren's own repos",
    url: "https://github.com/poteto",
    check: "https://api.github.com/users/poteto/repos?sort=pushed&per_page=15",
  },
];
export type IngestResponse = { run_id: number; added: number; updated: number; rejected: number; updates: number };
export type FailedRunRequest = { started_at: string; backend: string; error: string };
