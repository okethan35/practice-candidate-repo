import { Router } from "express";
import { fetchPlacements } from "../ats/fakeAts";
import { newId } from "../lib/ids";
import type { Store } from "../store";
import { apply } from "../sync/apply";
import type { RunHistory } from "../sync/runHistory";

// Rules 1-6, 20-24, 26-28: POST /api/sync with a per-tenant in-flight lock.
export function syncRouter(store: Store, history: RunHistory) {
  const router = Router();
  const inFlight = new Set<string>();

  router.post("/", async (req, res) => {
    const tenantId = req.tenantId as string;
    if (inFlight.has(tenantId)) return res.status(409).json({ error: "sync already in progress" });
    inFlight.add(tenantId);
    try {
      let payload: unknown;
      try {
        payload = await fetchPlacements(tenantId);
        if (!Array.isArray(payload)) throw new Error("payload is not an array");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const error = `ATS request failed: ${message}`;
        history.append(tenantId, {
          runId: newId("run"),
          outcome: "failed",
          error,
          finishedAt: new Date().toISOString(),
        });
        return res.status(502).json({ error });
      }
      const counts = apply(store, tenantId, payload);
      const run = { runId: newId("run"), ...counts, finishedAt: new Date().toISOString() };
      store.syncState[tenantId] = { lastSyncedAt: run.finishedAt, latestRun: run };
      history.append(tenantId, { ...run, outcome: "success" });
      const { finishedAt: _f, ...body } = run;
      return res.json(body);
    } finally {
      inFlight.delete(tenantId);
    }
  });

  return router;
}
