import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ats/fakeAts", async (orig) => {
  const actual = await orig<typeof import("../src/ats/fakeAts")>();
  return { ...actual, fetchPlacements: vi.fn() };
});

import { fetchPlacements } from "../src/ats/fakeAts";
import { createApp } from "../src/server";
import { createStore } from "../src/store";

const mocked = vi.mocked(fetchPlacements);
const real = async (t: string) => {
  const actual = await vi.importActual<typeof import("../src/ats/fakeAts")>("../src/ats/fakeAts");
  return actual.fetchPlacements(t, "key");
};

function setup() {
  const store = createStore();
  const app = createApp(store);
  const sync = (t: string) => request(app).post("/api/sync").set("x-tenant-id", t);
  const report = (t?: string, qs = "") => {
    const r = request(app).get("/api/reports/gross-profit" + qs);
    return t ? r.set("x-tenant-id", t) : r;
  };
  return { store, app, sync, report };
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(real);
});

const row = (clientName: string, a: number, b: number, c: number, d: number) =>
  expect.objectContaining({ clientName, revenueCents: a, payCents: b, burdenCents: c, grossProfitCents: d });

const rec = (o: Record<string, unknown>) => ({
  external_id: "X-1",
  client_name: "Acme Corp",
  worker_name: "W",
  bill_rate: 10,
  pay_rate: 5,
  hours: 1,
  week_start: "2026-11-02",
  ...o,
});

describe("GET /api/reports/gross-profit", () => {
  it("rejects missing and unknown tenants (rule 49)", async () => {
    const { report } = setup();
    const a = await report();
    expect(a.status).toBe(401);
    expect(a.body).toEqual({ error: "missing x-tenant-id" });
    const b = await report("t_nope");
    expect(b.status).toBe(403);
    expect(b.body).toEqual({ error: "unknown tenant" });
  });

  it("has no side effects and ignores body and other params (rule 50)", async () => {
    const { app, sync, report, store } = setup();
    await sync("t_alpha");
    mocked.mockClear();
    const storeBefore = structuredClone(store);
    const histBefore = structuredClone(app.locals.syncRuns("t_alpha"));
    const a = await report("t_alpha");
    const b = await request(app)
      .get("/api/reports/gross-profit?foo=1")
      .set("x-tenant-id", "t_alpha")
      .send({ week: "2026-11-09", foo: 1 });
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(mocked).not.toHaveBeenCalled();
    expect(store).toEqual(storeBefore);
    expect(app.locals.syncRuns("t_alpha")).toEqual(histBefore);
    expect((await sync("t_alpha")).status).toBe(200);
  });

  it("returns empty rows for a never-synced tenant (rule 53)", async () => {
    const { report } = setup();
    const r = await report("t_alpha");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ rows: [] });
  });

  it("matches the fixture totals exactly (rules 51, 55, 56, 59)", async () => {
    const { sync, report } = setup();
    await sync("t_alpha");
    await sync("t_beta");
    const cases: Array<[string, string, any[]]> = [
      ["t_alpha", "", [row("Globex", 375200, 244000, 29280, 101920), row("Acme Corp", 265468, 182193, 21863, 61412)]],
      ["t_beta", "", [row("Initech", 438000, 292000, 35040, 110960), row("Hooli", 169200, 108360, 13003, 47837)]],
      ["t_alpha", "?week=2026-11-02", [row("Globex", 220000, 144000, 17280, 58720), row("Acme Corp", 172368, 118493, 14219, 39656)]],
      ["t_beta", "?week=2026-11-02", [row("Initech", 228000, 152000, 18240, 57760), row("Hooli", 169200, 108360, 13003, 47837)]],
      ["t_alpha", "?week=2026-11-09", [row("Globex", 155200, 100000, 12000, 43200), row("Acme Corp", 93100, 63700, 7644, 21756)]],
      ["t_beta", "?week=2026-11-09", [row("Initech", 210000, 140000, 16800, 53200)]],
    ];
    for (const [t, qs, expected] of cases) {
      const r = await report(t, qs);
      expect(r.status).toBe(200);
      expect(r.body.rows).toEqual(expected);
      for (const x of r.body.rows) {
        expect(Object.keys(x).sort()).toEqual(
          ["burdenCents", "clientId", "clientName", "grossProfitCents", "payCents", "revenueCents"],
        );
        for (const k of ["revenueCents", "payCents", "burdenCents", "grossProfitCents"]) expect(Number.isInteger(x[k])).toBe(true);
      }
    }
  });

  it("rounds exact decimals half-up (rule 54)", async () => {
    const { sync, report } = setup();
    mocked.mockResolvedValueOnce([rec({ bill_rate: 1.005, pay_rate: 0 }), rec({ external_id: "X-2", client_name: "Zed", bill_rate: 0.01, pay_rate: 0, hours: 0.5 })] as any);
    await sync("t_alpha");
    const r = await report("t_alpha");
    expect(r.body.rows).toEqual([
      expect.objectContaining({ clientName: "Acme Corp", revenueCents: 101 }),
      expect.objectContaining({ clientName: "Zed", revenueCents: 1 }),
    ]);
  });

  it("counts hand-pushed placements, zero hours, and negative profit sorted last (rules 52, 55, 59)", async () => {
    const { store, report } = setup();
    const base = { tenantId: "t_alpha", workerName: "w", weekStart: "2026-11-02" };
    store.placements.push(
      { id: "p1", clientId: "c_alpha_acme", billRate: 10, payRate: 5, hours: 0, ...base },
      { id: "p2", clientId: "c_alpha_globex", billRate: 1, payRate: 5, hours: 1, ...base },
    );
    const r = await report("t_alpha");
    expect(r.body.rows).toEqual([
      expect.objectContaining({ clientName: "Acme Corp", revenueCents: 0, payCents: 0, burdenCents: 0, grossProfitCents: 0 }),
      expect.objectContaining({ clientName: "Globex", grossProfitCents: 100 - 500 - 60 }),
    ]);
  });

  it("week filter edge cases (rules 57-58)", async () => {
    const { sync, report } = setup();
    await sync("t_alpha");
    const all = (await report("t_alpha")).body;
    expect(all.rows.length).toBe(2);
    expect((await report("t_alpha", "?week=")).body).toEqual(all);
    for (const qs of [
      "?week=banana",
      "?week=2026-02-30",
      "?week=2026-11-2",
      "?week=%202026-11-02",
      "?week=2026-11-02&week=2026-11-09",
      "?week=2026-11-16",
    ]) {
      const r = await report("t_alpha", qs);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ rows: [] });
    }
  });

  it("breaks ties by clientName then clientId (rule 59)", async () => {
    const { store, report } = setup();
    store.clients.length = 0;
    store.clients.push(
      { id: "c_z", tenantId: "t_alpha", name: "Same" },
      { id: "c_a", tenantId: "t_alpha", name: "Same" },
      { id: "c_m", tenantId: "t_alpha", name: "Alpha" },
      { id: "c_lower", tenantId: "t_alpha", name: "alpha" },
    );
    for (const id of ["c_z", "c_a", "c_m", "c_lower"])
      store.placements.push({ id: "p" + id, tenantId: "t_alpha", clientId: id, workerName: "w", billRate: 10, payRate: 5, hours: 1, weekStart: "2026-11-02" });
    const r = await report("t_alpha");
    expect(r.body.rows.map((x: any) => x.clientId)).toEqual(["c_m", "c_a", "c_z", "c_lower"]);
  });

  it("is consistent around syncs in flight and 502s (rule 60)", async () => {
    const { sync, report } = setup();
    await sync("t_alpha");
    const pre = (await report("t_alpha")).body;
    expect((await report("t_alpha")).body).toEqual(pre);
    let release!: (v: any[]) => void;
    mocked.mockReturnValueOnce(new Promise((r) => (release = r)));
    const inflight = sync("t_alpha").then((r) => r);
    await vi.waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    const during = await report("t_alpha");
    expect(during.status).toBe(200);
    expect(during.body).toEqual(pre);
    release([]);
    expect((await inflight).status).toBe(200);
    mocked.mockRejectedValueOnce(new Error("boom"));
    expect((await sync("t_alpha")).status).toBe(502);
    expect((await report("t_alpha")).body).toEqual(pre);
  });

  it("isolates tenants with the same client name (rule 61)", async () => {
    const { sync, report } = setup();
    mocked.mockResolvedValueOnce([rec({ hours: 1 })] as any);
    await sync("t_alpha");
    mocked.mockResolvedValueOnce([rec({ hours: 3 })] as any);
    await sync("t_beta");
    const a = await report("t_alpha");
    const b = await report("t_beta");
    expect(a.body.rows).toEqual([expect.objectContaining({ clientName: "Acme Corp", revenueCents: 1000 })]);
    expect(b.body.rows).toEqual([expect.objectContaining({ clientName: "Acme Corp", revenueCents: 3000 })]);
    expect(a.body.rows[0].clientId).not.toBe(b.body.rows[0].clientId);
  });

  it("counts a relinked placement only under its new client (rule 62)", async () => {
    const { sync, report } = setup();
    mocked.mockResolvedValueOnce([rec({})] as any);
    await sync("t_alpha");
    expect((await report("t_alpha")).body.rows.map((r: any) => r.clientName)).toEqual(["Acme Corp"]);
    mocked.mockResolvedValueOnce([rec({ client_name: "Globex" })] as any);
    await sync("t_alpha");
    const r = await report("t_alpha");
    expect(r.body.rows).toEqual([expect.objectContaining({ clientName: "Globex", revenueCents: 1000 })]);
  });
});
