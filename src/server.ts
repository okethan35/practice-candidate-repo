import express from "express";
import { requireTenant } from "./auth";
import { placementsRouter } from "./routes/placements";
import { createStore, type Store } from "./store";

export function createApp(store: Store = createStore()) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api", requireTenant(store));
  app.use("/api/placements", placementsRouter(store));

  return app;
}
