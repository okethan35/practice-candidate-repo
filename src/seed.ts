import type { Store } from "./store";

export function seed(): Store {
  return {
    tenants: [
      { id: "t_alpha", name: "Alpha Staffing" },
      { id: "t_beta", name: "Beta Talent" },
    ],
    clients: [
      { id: "c_alpha_acme", tenantId: "t_alpha", name: "Acme Corp" },
      { id: "c_alpha_globex", tenantId: "t_alpha", name: "Globex" },
      { id: "c_beta_initech", tenantId: "t_beta", name: "Initech" },
    ],
    placements: [],
    syncState: {
      t_alpha: { lastSyncedAt: null, latestRun: null },
      t_beta: { lastSyncedAt: null, latestRun: null },
    },
  };
}
