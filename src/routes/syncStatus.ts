import { Router } from "express";
import type { Store } from "../store";

// Rules 34-42: read-only GET /api/sync/status for the calling tenant.
export function syncStatusRouter(store: Store) {
  const router = Router();

  router.get("/", (req, res) => {
    const state = store.syncState[req.tenantId as string];
    res.json({
      lastSyncedAt: state?.lastSyncedAt ?? null,
      lastRun: state?.latestRun ? { ...state.latestRun } : null,
    });
  });

  return router;
}
