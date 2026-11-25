// Rules 43-47: per-tenant, in-memory sync run history kept outside the store.
export type SyncRunEntry =
  | {
      runId: string;
      outcome: "success";
      inserted: number;
      updated: number;
      unchanged: number;
      failed: number;
      finishedAt: string;
    }
  | { runId: string; outcome: "failed"; error: string; finishedAt: string };

export interface RunHistory {
  append(tenantId: string, entry: SyncRunEntry): void;
  list(tenantId: string): SyncRunEntry[];
}

export function createRunHistory(): RunHistory {
  const byTenant = new Map<string, SyncRunEntry[]>();
  return {
    append(tenantId, entry) {
      const list = byTenant.get(tenantId) ?? [];
      list.push(entry);
      byTenant.set(tenantId, list);
    },
    list(tenantId) {
      return (byTenant.get(tenantId) ?? []).map((e) => ({ ...e }));
    },
  };
}
