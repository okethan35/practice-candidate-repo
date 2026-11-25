import { Router } from "express";
import { grossProfit } from "../lib/money";
import type { Store } from "../store";

export function placementsRouter(store: Store) {
  const router = Router();

  router.get("/", (req, res) => {
    const rows = store.placements
      .filter((p) => p.tenantId === req.tenantId)
      .map((p) => ({ ...p, grossProfit: grossProfit(p) }));
    res.json(rows);
  });

  router.get("/:id", (req, res) => {
    const p = store.placements.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: "not found" });
    res.json({ ...p, grossProfit: grossProfit(p) });
  });

  return router;
}
