import { seed } from "./seed";

export interface Tenant {
  id: string;
  name: string;
}

export interface Client {
  id: string;
  tenantId: string;
  name: string;
}

export interface Placement {
  id: string;
  tenantId: string;
  clientId: string;
  workerName: string;
  billRate: number; // dollars per hour
  payRate: number; // dollars per hour
  hours: number;
  weekStart: string; // YYYY-MM-DD
  externalId?: string; // set for placements synced from the ATS
}

export interface SyncRun {
  runId: string;
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
  finishedAt: string; // ISO 8601
}

export interface TenantSyncState {
  lastSyncedAt: string | null;
  latestRun: SyncRun | null;
}

export interface Store {
  tenants: Tenant[];
  clients: Client[];
  placements: Placement[];
  syncState: Record<string, TenantSyncState>;
}

export function createStore(): Store {
  return seed();
}
