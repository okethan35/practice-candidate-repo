import { Router } from "express";
import { grossProfitRows } from "../report/grossProfit";
import type { Store } from "../store";

// Rules 49-62: read-only gross-profit report for the calling tenant.
export function reportsRouter(store: Store) {
  const router = Router();

  router.get("/gross-profit", (req, res) => {
    const tenantId = req.tenantId as string;
    res.json({ rows: grossProfitRows(store.clients, store.placements, tenantId, req.query.week) });
  });

  return router;
}
