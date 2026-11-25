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

export interface Store {
  tenants: Tenant[];
  clients: Client[];
  placements: Placement[];
}

export function createStore(): Store {
  return seed();
}
