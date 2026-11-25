import express from "express";
import { requireTenant } from "./auth";
import { placementsRouter } from "./routes/placements";
import { syncRouter } from "./routes/sync";
import { createStore, type Store } from "./store";
import { createRunHistory } from "./sync/runHistory";

export function createApp(store: Store = createStore()) {
  const app = express();
  const history = createRunHistory();
  app.locals.syncRuns = (tenantId: string) => history.list(tenantId);
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api", requireTenant(store));
  app.use("/api/placements", placementsRouter(store));
  app.use("/api/sync", syncRouter(store, history));

  return app;
}
