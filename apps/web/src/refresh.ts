import { existsSync, readFileSync } from "node:fs";
import { request } from "node:https";

/** What happened when someone pressed Refresh. The status page shows a sentence for each. */
export type RefreshOutcome = "started" | "running" | "cooldown" | "unavailable" | "failed";

/** The two Kubernetes calls a refresh needs. Tests pass a fake. */
export type JobsApi = {
  /** Researcher Jobs still running, from the nightly CronJob or an earlier refresh. */
  activeJobs(): Promise<number>;
  /** Starts a Job from the researcher CronJob's template, like `kubectl create job --from=cronjob/researcher`. */
  startFromCronJob(): Promise<void>;
};

export type Refresher = { trigger(lastSuccessAt: string | null): Promise<RefreshOutcome> };

/**
 * Anyone can press the public button, and each run spends Claude usage, so a run starts only when none is running
 * and neither a run nor a press happened within `cooldownMs`.
 */
export function createRefresher(api: JobsApi | null, opts: { cooldownMs: number; now?: () => number }): Refresher {
  const now = opts.now ?? Date.now;
  let lastPress = 0;
  let pending: Promise<RefreshOutcome> | null = null;

  const run = async (lastSuccessAt: string | null): Promise<RefreshOutcome> => {
    if (!api) return "unavailable";
    const last = Math.max(lastPress, lastSuccessAt ? Date.parse(lastSuccessAt) || 0 : 0);
    if (now() - last < opts.cooldownMs) return "cooldown";
    try {
      if ((await api.activeJobs()) > 0) return "running";
      await api.startFromCronJob();
      lastPress = now();
      return "started";
    } catch (err) {
      console.error("refresh failed:", err);
      return "failed";
    }
  };

  return {
    trigger(lastSuccessAt) {
      // Two presses at once share one check, so they can't start two Jobs.
      pending ??= run(lastSuccessAt).finally(() => (pending = null));
      return pending;
    },
  };
}

const SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";

/** The in-cluster Kubernetes API, or null outside a cluster or when the pod has no service account token. */
export function inClusterJobsApi(env: NodeJS.ProcessEnv, cronJob = "researcher"): JobsApi | null {
  const host = env.KUBERNETES_SERVICE_HOST;
  if (!host || !existsSync(`${SA_DIR}/token`)) return null;
  const port = Number(env.KUBERNETES_SERVICE_PORT || 443);
  const ca = readFileSync(`${SA_DIR}/ca.crt`);
  const namespace = readFileSync(`${SA_DIR}/namespace`, "utf8").trim();

  const call = (method: "GET" | "POST", path: string, body?: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      // The token rotates, so read it for every call.
      const token = readFileSync(`${SA_DIR}/token`, "utf8").trim();
      const data = body === undefined ? undefined : JSON.stringify(body);
      const req = request(
        {
          host,
          port,
          path,
          method,
          ca,
          timeout: 10_000,
          headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(data ? { "content-type": "application/json" } : {}) },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (text += chunk));
          res.on("end", () => {
            const code = res.statusCode ?? 0;
            if (code >= 200 && code < 300) resolve(text ? JSON.parse(text) : null);
            else reject(new Error(`${method} ${path}: HTTP ${code} ${text.slice(0, 300)}`));
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error(`${method} ${path}: timeout`)));
      req.on("error", reject);
      req.end(data);
    });

  const jobs = `/apis/batch/v1/namespaces/${namespace}/jobs`;
  return {
    async activeJobs() {
      const list = (await call("GET", `${jobs}?labelSelector=${encodeURIComponent("app=researcher")}`)) as {
        items: { status?: { active?: number } }[];
      };
      return list.items.filter((j) => (j.status?.active ?? 0) > 0).length;
    },
    async startFromCronJob() {
      const cj = (await call("GET", `/apis/batch/v1/namespaces/${namespace}/cronjobs/${cronJob}`)) as {
        spec: { jobTemplate: { spec: unknown } };
      };
      await call("POST", jobs, {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
          generateName: `${cronJob}-refresh-`,
          labels: { app: "researcher", trigger: "refresh" },
          annotations: { "cronjob.kubernetes.io/instantiate": "manual" },
        },
        spec: cj.spec.jobTemplate.spec,
      });
    },
  };
}
