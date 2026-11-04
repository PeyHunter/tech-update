import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time compare; hashing first makes the lengths equal. */
export function tokenMatches(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

/** Bearer auth. No token configured → 503, so a missing secret never means "open". */
export function bearer(expected: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!expected) return c.json({ error: "endpoint disabled: token not configured" }, 503);
    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer (.+)$/i.exec(header);
    if (!match || !tokenMatches(match[1]!, expected)) {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
