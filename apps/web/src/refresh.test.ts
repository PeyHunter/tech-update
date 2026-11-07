import { describe, expect, it } from "vitest";
import { openDb } from "./db/migrate.js";
import { createRefresher, type JobsApi } from "./refresh.js";
import { createPublicApp } from "./server.js";

const HOUR = 3_600_000;

function fakeApi(active = 0) {
  const calls = { started: 0 };
  const api: JobsApi = {
    activeJobs: async () => active,
    startFromCronJob: async () => void calls.started++,
  };
  return { api, calls };
}

describe("refresher", () => {
  it("starts a run, then holds off for the cooldown", async () => {
    let t = 10 * HOUR;
    const { api, calls } = fakeApi();
    const r = createRefresher(api, { cooldownMs: HOUR, now: () => t });
    expect(await r.trigger(null)).toBe("started");
    expect(await r.trigger(null)).toBe("cooldown");
    t += HOUR;
    expect(await r.trigger(null)).toBe("started");
    expect(calls.started).toBe(2);
  });

  it("does not start when the last good run is recent", async () => {
    const t = Date.parse("2026-11-07T12:00:00Z");
    const { api, calls } = fakeApi();
    const r = createRefresher(api, { cooldownMs: HOUR, now: () => t });
    expect(await r.trigger("2026-11-07T11:30:00Z")).toBe("cooldown");
    expect(await r.trigger("2026-11-07T10:30:00Z")).toBe("started");
    expect(calls.started).toBe(1);
  });

  it("does not start a second run while one is going", async () => {
    const { api, calls } = fakeApi(1);
    const r = createRefresher(api, { cooldownMs: HOUR });
    expect(await r.trigger(null)).toBe("running");
    expect(calls.started).toBe(0);
  });

  it("two presses at once start one run", async () => {
    const { api, calls } = fakeApi();
    const r = createRefresher(api, { cooldownMs: HOUR });
    expect(await Promise.all([r.trigger(null), r.trigger(null)])).toEqual(["started", "started"]);
    expect(calls.started).toBe(1);
  });

  it("reports unavailable without a cluster and failed when Kubernetes errors", async () => {
    expect(await createRefresher(null, { cooldownMs: HOUR }).trigger(null)).toBe("unavailable");
    const broken: JobsApi = { activeJobs: async () => 0, startFromCronJob: async () => Promise.reject(new Error("403")) };
    expect(await createRefresher(broken, { cooldownMs: HOUR }).trigger(null)).toBe("failed");
  });
});

describe("refresh button", () => {
  const app = (api: JobsApi | null) =>
    createPublicApp({
      db: openDb(":memory:"),
      config: { ingestToken: "i", adminToken: "a", publicUrl: "https://example.test" },
      stylesCss: null,
      refresher: createRefresher(api, { cooldownMs: HOUR }),
    });

  it("is on every page and posts to /refresh", async () => {
    const html = await (await app(null).request("/")).text();
    expect(html).toContain('action="/refresh"');
  });

  it("redirects to the status page with the outcome", async () => {
    const pub = app(fakeApi().api);
    const res = await pub.request("/refresh", { method: "POST" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/status?refresh=started");
    const page = await (await pub.request("/status?refresh=started")).text();
    expect(page).toContain("Refresh started");
    expect((await pub.request("/refresh", { method: "POST" })).headers.get("location")).toBe("/status?refresh=cooldown");
  });

  it("ignores unknown outcomes in the query", async () => {
    const page = await (await app(null).request("/status?refresh=<script>")).text();
    expect(page).not.toContain('class="notice');
  });
});
