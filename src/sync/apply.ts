import { newId } from "../lib/ids";
import type { Client, Placement, Store } from "../store";
import { clientDisplayName, clientKey } from "./clientKey";
import { validateAtsRecord } from "./validate";

export interface ApplyResult {
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
}

const FIELDS = ["clientId", "workerName", "billRate", "payRate", "hours", "weekStart"] as const;

// Rules 11-19, 25, 29: apply a payload to one tenant. The whole payload is
// processed into a plan first; the store is only written once nothing threw.
export function apply(store: Store, tenantId: string, records: unknown[]): ApplyResult {
  const result: ApplyResult = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };

  const clientsByKey = new Map<string, string>();
  for (const c of store.clients) {
    if (c.tenantId === tenantId && !clientsByKey.has(clientKey(c.name))) clientsByKey.set(clientKey(c.name), c.id);
  }
  const stored = new Map<string, Placement>();
  for (const p of store.placements) {
    if (p.tenantId === tenantId && p.externalId !== undefined) stored.set(p.externalId, p);
  }

  const newClients: Client[] = [];
  const newPlacements: Placement[] = [];
  const updates: Array<{ target: Placement; values: Pick<Placement, (typeof FIELDS)[number]> }> = [];
  const seen = new Set<string>();

  for (const raw of records) {
    const v = validateAtsRecord(raw);
    const rawId = (raw as { external_id?: unknown } | null)?.external_id;
    const id = v.valid ? v.record.external_id : typeof rawId === "string" ? rawId.trim() : "";
    if (id !== "") {
      if (seen.has(id)) {
        result.failed++;
        continue;
      }
      seen.add(id);
    }
    if (!v.valid) {
      result.failed++;
      continue;
    }
    const r = v.record;
    const key = clientKey(r.client_name);
    let clientId = clientsByKey.get(key);
    if (clientId === undefined) {
      clientId = newId("c");
      clientsByKey.set(key, clientId);
      newClients.push({ id: clientId, tenantId, name: clientDisplayName(r.client_name) });
    }
    const values = {
      clientId,
      workerName: r.worker_name,
      billRate: r.bill_rate,
      payRate: r.pay_rate,
      hours: r.hours,
      weekStart: r.week_start,
    };
    const existing = stored.get(r.external_id);
    if (!existing) {
      newPlacements.push({ id: newId("p"), tenantId, externalId: r.external_id, ...values });
      result.inserted++;
    } else if (FIELDS.some((f) => existing[f] !== values[f])) {
      updates.push({ target: existing, values });
      result.updated++;
    } else {
      result.unchanged++;
    }
  }

  store.clients.push(...newClients);
  for (const u of updates) Object.assign(u.target, u.values);
  store.placements.push(...newPlacements);
  return result;
}
