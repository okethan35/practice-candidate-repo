import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStore } from "../src/store";
import { apply } from "../src/sync/apply";

const feed = JSON.parse(readFileSync(new URL("../fixtures/ats-feed.json", import.meta.url), "utf8"));
const alpha = () => structuredClone(feed.t_alpha) as any[];
const beta = () => structuredClone(feed.t_beta) as any[];
const synced = (s: ReturnType<typeof createStore>, t: string) =>
  s.placements.filter((p) => p.tenantId === t && p.externalId !== undefined);
const base = { external_id: "N-1", client_name: "Foo Co", worker_name: "W", bill_rate: 2, pay_rate: 1, hours: 1, week_start: "2026-11-02" };

describe("apply", () => {
  it("applies t_alpha to a fresh store", () => {
    const s = createStore();
    expect(apply(s, "t_alpha", alpha())).toEqual({ inserted: 5, updated: 0, unchanged: 0, failed: 1 });
    const ids = ["A-1001", "A-1002", "A-1005"].map((e) => s.placements.find((p) => p.externalId === e)!.clientId);
    expect(ids).toEqual(["c_alpha_acme", "c_alpha_acme", "c_alpha_acme"]);
    expect(s.clients.filter((c) => c.tenantId === "t_alpha")).toHaveLength(2);
    const p = s.placements.find((x) => x.externalId === "A-1001")!;
    expect(p).toMatchObject({ tenantId: "t_alpha", workerName: "Sam Ortiz", billRate: 42.1, payRate: 28.7, hours: 37.5, weekStart: "2026-11-02" });
    expect(p.id).toBeTruthy();
  });

  it("creates Hooli for t_beta and links Initech", () => {
    const s = createStore();
    expect(apply(s, "t_beta", beta())).toEqual({ inserted: 3, updated: 0, unchanged: 0, failed: 0 });
    const added = s.clients.filter((c) => c.tenantId === "t_beta" && c.id !== "c_beta_initech");
    expect(added.map((c) => c.name)).toEqual(["Hooli"]);
    for (const e of ["B-2001", "B-2002"]) expect(s.placements.find((p) => p.externalId === e)!.clientId).toBe("c_beta_initech");
  });

  it("merges new client names by key, using the first name", () => {
    const s = createStore();
    const r = apply(s, "t_alpha", [
      { ...base, external_id: "N-1", client_name: "  Foo   Co " },
      { ...base, external_id: "N-2", client_name: "FOO CO." },
    ]);
    expect(r.inserted).toBe(2);
    const foo = s.clients.filter((c) => c.name === "Foo Co");
    expect(foo).toHaveLength(1);
    expect(s.clients.filter((c) => c.tenantId === "t_alpha")).toHaveLength(3);
    expect(synced(s, "t_alpha").every((p) => p.clientId === foo[0].id)).toBe(true);
  });

  it("is idempotent on a second apply", () => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    expect(apply(s, "t_alpha", alpha())).toEqual({ inserted: 0, updated: 0, unchanged: 5, failed: 1 });
    expect(synced(s, "t_alpha")).toHaveLength(5);
  });

  it("updates changed fields", () => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    const p = alpha();
    p[2].hours = 12;
    expect(apply(s, "t_alpha", p)).toEqual({ inserted: 0, updated: 1, unchanged: 4, failed: 1 });
    expect(s.placements.find((x) => x.externalId === "A-1003")!.hours).toBe(12);
  });

  it("treats a client name change normalizing to the same client as unchanged", () => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    const r = apply(s, "t_alpha", [{ ...alpha()[0], client_name: "ACME CORP" }]);
    expect(r).toEqual({ inserted: 0, updated: 0, unchanged: 1, failed: 0 });
  });

  it("keeps the stored record when it comes back invalid", () => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    const before = structuredClone(s);
    const { bill_rate, ...bad } = alpha()[0];
    expect(apply(s, "t_alpha", [bad])).toEqual({ inserted: 0, updated: 0, unchanged: 0, failed: 1 });
    expect(s).toEqual(before);
  });

  it("inserts a record that was invalid earlier", () => {
    const s = createStore();
    const { bill_rate, ...bad } = alpha()[0];
    expect(apply(s, "t_alpha", [bad]).failed).toBe(1);
    expect(synced(s, "t_alpha")).toHaveLength(0);
    expect(apply(s, "t_alpha", [alpha()[0]]).inserted).toBe(1);
  });

  it("fails the second occurrence of an external_id", () => {
    const s = createStore();
    const p = [alpha()[0], alpha()[0]];
    const r = apply(s, "t_alpha", p);
    expect(r).toEqual({ inserted: 1, updated: 0, unchanged: 0, failed: 1 });
    expect(r.inserted + r.updated + r.unchanged + r.failed).toBe(p.length);
    expect(synced(s, "t_alpha")).toHaveLength(1);
  });

  it("fails a duplicate even when the first occurrence was invalid", () => {
    const s = createStore();
    const r = apply(s, "t_alpha", [{ ...base, bill_rate: -1 }, base]);
    expect(r).toEqual({ inserted: 0, updated: 0, unchanged: 0, failed: 2 });
  });

  it("does not let a duplicate update the first occurrence", () => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    const r = apply(s, "t_alpha", [alpha()[2], { ...alpha()[2], hours: 1 }]);
    expect(r).toEqual({ inserted: 0, updated: 0, unchanged: 1, failed: 1 });
    expect(s.placements.find((x) => x.externalId === "A-1003")!.hours).toBe(40);
  });

  it("leaves absent stored placements alone and uncounted", () => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    const a4 = structuredClone(s.placements.find((p) => p.externalId === "A-1004")!);
    const r = apply(s, "t_alpha", alpha().filter((x) => x.external_id !== "A-1004"));
    expect(r).toEqual({ inserted: 0, updated: 0, unchanged: 4, failed: 1 });
    expect(s.placements.find((p) => p.externalId === "A-1004")).toEqual(a4);
  });

  it("never touches placements without an externalId", () => {
    const s = createStore();
    s.placements.push({ id: "p_a", tenantId: "t_alpha", clientId: "c_alpha_acme", workerName: "Sam Ortiz", billRate: 42.1, payRate: 28.7, hours: 37.5, weekStart: "2026-11-02" });
    const before = structuredClone(s.placements[0]);
    expect(apply(s, "t_alpha", [alpha()[0]]).inserted).toBe(1);
    expect(s.placements[0]).toEqual(before);
    expect(s.placements).toHaveLength(2);
  });

  it("creates no client for an invalid record", () => {
    const s = createStore();
    const n = s.clients.length;
    apply(s, "t_alpha", [{ ...base, client_name: "Newco", hours: -1 }]);
    expect(s.clients).toHaveLength(n);
  });

  it("isolates tenants", () => {
    const s = createStore();
    apply(s, "t_beta", beta());
    s.clients.push({ id: "c_beta_acme", tenantId: "t_beta", name: "Acme Corp" });
    const before = structuredClone({ c: s.clients.filter((c) => c.tenantId === "t_beta"), p: s.placements.filter((p) => p.tenantId === "t_beta") });
    apply(s, "t_alpha", alpha());
    expect({ c: s.clients.filter((c) => c.tenantId === "t_beta"), p: s.placements.filter((p) => p.tenantId === "t_beta") }).toEqual(before);
    expect(s.placements.find((p) => p.externalId === "A-1001")!.clientId).toBe("c_alpha_acme");
  });

  it("does not match placements of another tenant by externalId", () => {
    const s = createStore();
    apply(s, "t_beta", [{ ...base, external_id: "X-1", client_name: "Initech" }]);
    expect(apply(s, "t_alpha", [{ ...base, external_id: "X-1" }]).inserted).toBe(1);
    expect(synced(s, "t_beta")).toHaveLength(1);
  });

  it("trims external_id and worker_name", () => {
    const s = createStore();
    apply(s, "t_alpha", [{ ...base, external_id: " N-1 ", worker_name: "  Sam " }]);
    expect(s.placements[0]).toMatchObject({ externalId: "N-1", workerName: "Sam" });
    expect(apply(s, "t_alpha", [base]).updated).toBe(1);
  });

  it("makes no partial write when the payload throws (rule 25)", () => {
    const s = createStore();
    apply(s, "t_alpha", [alpha()[0]]);
    const before = structuredClone(s);
    const boom = new Proxy({}, { get() { throw new Error("boom"); } });
    const p = [{ ...base, external_id: "Z-1", client_name: "Brand New" }, { ...alpha()[0], hours: 1 }, boom];
    expect(() => apply(s, "t_alpha", p)).toThrow();
    expect(s).toEqual(before);
  });
});

describe("apply (reviewer findings)", () => {
  it("does not link to a client that exists only in another tenant", () => {
    const s = createStore();
    const r = apply(s, "t_alpha", [{ ...base, external_id: "I-1", client_name: "Initech" }]);
    expect(r.inserted).toBe(1);
    const p = s.placements.find((x) => x.externalId === "I-1")!;
    expect(p.clientId).not.toBe("c_beta_initech");
    const c = s.clients.find((x) => x.id === p.clientId)!;
    expect(c).toMatchObject({ tenantId: "t_alpha", name: "Initech" });
  });

  it("never renames an existing client", () => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    expect(s.clients.find((c) => c.id === "c_alpha_acme")!.name).toBe("Acme Corp");
  });

  it("counts a client change as updated and relinks the placement", () => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    const globex = s.placements.find((p) => p.externalId === "A-1003")!.clientId;
    expect(globex).not.toBe("c_alpha_acme");
    const r = apply(s, "t_alpha", [{ ...alpha()[2], client_name: "Acme Corp" }]);
    expect(r).toEqual({ inserted: 0, updated: 1, unchanged: 0, failed: 0 });
    expect(s.placements.find((p) => p.externalId === "A-1003")!.clientId).toBe("c_alpha_acme");
  });

  it.each([
    ["bill_rate", "billRate", 99],
    ["pay_rate", "payRate", 5],
    ["week_start", "weekStart", "2026-11-16"],
    ["worker_name", "workerName", "Someone Else"],
  ] as const)("counts a %s change as updated", (field, prop, value) => {
    const s = createStore();
    apply(s, "t_alpha", alpha());
    const r = apply(s, "t_alpha", [{ ...alpha()[0], [field]: value }]);
    expect(r).toEqual({ inserted: 0, updated: 1, unchanged: 0, failed: 0 });
    expect((s.placements.find((p) => p.externalId === "A-1001")! as any)[prop]).toBe(value);
  });
});
