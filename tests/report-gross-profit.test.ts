import { describe, expect, it } from "vitest";
import { grossProfitRows, placementCents } from "../src/report/grossProfit";
import type { Client, Placement } from "../src/store";

const pl = (o: Partial<Placement>): Placement => ({
  id: "p" + Math.random(),
  tenantId: "t",
  clientId: "c1",
  workerName: "w",
  billRate: 10,
  payRate: 5,
  hours: 1,
  weekStart: "2026-11-02",
  ...o,
});
const cl = (id: string, name: string, tenantId = "t"): Client => ({ id, tenantId, name });

describe("placementCents (rule 54)", () => {
  it("rounds exact decimals half-up", () => {
    expect(placementCents({ hours: 1, billRate: 1.005, payRate: 0 }).revenueCents).toBe(101);
    expect(placementCents({ hours: 0.5, billRate: 0.01, payRate: 0 }).revenueCents).toBe(1);
    expect(placementCents({ hours: 1, billRate: 0, payRate: 1.004 }).payCents).toBe(100);
  });
  it("burden is 12% of rounded pay, rounded half-up", () => {
    // pay 50 cents -> burden 6; pay 54 -> 6.48 -> 6; pay predicts 12% half: 4 cents -> .48 -> 0, 42 -> 5.04 -> 5
    expect(placementCents({ hours: 1, billRate: 0, payRate: 0.5 }).burdenCents).toBe(6);
    expect(placementCents({ hours: 1, billRate: 0, payRate: 0.42 }).burdenCents).toBe(5);
    // 100 cents pay -> 12; 125 -> 15; 1 cent -> 0; 5 cents -> 0.6 -> 1
    expect(placementCents({ hours: 1, billRate: 0, payRate: 0.05 }).burdenCents).toBe(1);
  });
  it("gross profit = revenue - pay - burden; zero hours gives zeros; negative when bill < pay", () => {
    expect(placementCents({ hours: 10, billRate: 20, payRate: 10 })).toEqual({
      revenueCents: 20000,
      payCents: 10000,
      burdenCents: 1200,
      grossProfitCents: 8800,
    });
    expect(placementCents({ hours: 0, billRate: 20, payRate: 10 })).toEqual({
      revenueCents: 0,
      payCents: 0,
      burdenCents: 0,
      grossProfitCents: 0,
    });
    expect(placementCents({ hours: 1, billRate: 5, payRate: 10 }).grossProfitCents).toBeLessThan(0);
  });
  it("handles exponent-form numbers", () => {
    expect(placementCents({ hours: 1e21, billRate: 1, payRate: 0 }).revenueCents).toBe(1e23);
    expect(placementCents({ hours: 1e-7, billRate: 1, payRate: 0 }).revenueCents).toBe(0);
  });
});

describe("grossProfitRows (rules 51-62)", () => {
  it("sums per client, omits clients without placements, only own tenant", () => {
    const clients = [cl("c1", "A"), cl("c2", "B"), cl("c3", "A", "other")];
    const ps = [pl({}), pl({}), pl({ tenantId: "other", clientId: "c3" })];
    const rows = grossProfitRows(clients, ps, "t", undefined);
    expect(rows).toEqual([
      { clientId: "c1", clientName: "A", revenueCents: 2000, payCents: 1000, burdenCents: 120, grossProfitCents: 880 },
    ]);
    for (const r of rows) for (const v of Object.values(r).slice(2)) expect(Number.isInteger(v)).toBe(true);
  });
  it("week filter: exact match, empty = all, invalid / array = []", () => {
    const clients = [cl("c1", "A")];
    const ps = [pl({ weekStart: "2026-11-02" }), pl({ weekStart: "2026-11-09" })];
    expect(grossProfitRows(clients, ps, "t", "2026-11-02")[0].revenueCents).toBe(1000);
    expect(grossProfitRows(clients, ps, "t", "")).toEqual(grossProfitRows(clients, ps, "t", undefined));
    for (const w of ["banana", "2026-02-30", "2026-11-2", " 2026-11-02", "2026-11-16", ["2026-11-02", "2026-11-09"]])
      expect(grossProfitRows(clients, ps, "t", w)).toEqual([]);
  });
  it("counts placements without externalId", () => {
    expect(grossProfitRows([cl("c1", "A")], [pl({})], "t", undefined)).toHaveLength(1);
  });
  it("sorts by gross profit desc, negative last, ties by name then id", () => {
    const clients = [cl("c1", "B"), cl("c2", "A"), cl("c3", "Neg"), cl("c4", "A"), cl("c5", "Top")];
    const ps = [
      pl({ clientId: "c1" }),
      pl({ clientId: "c2" }),
      pl({ clientId: "c3", billRate: 1, payRate: 5 }),
      pl({ clientId: "c4" }),
      pl({ clientId: "c5", hours: 5 }),
    ];
    expect(grossProfitRows(clients, ps, "t", undefined).map((r) => r.clientId)).toEqual(["c5", "c2", "c4", "c1", "c3"]);
  });
  it("code-unit order puts uppercase before lowercase", () => {
    const clients = [cl("c1", "a"), cl("c2", "B")];
    const ps = [pl({ clientId: "c1" }), pl({ clientId: "c2" })];
    expect(grossProfitRows(clients, ps, "t", undefined).map((r) => r.clientName)).toEqual(["B", "a"]);
  });
});
