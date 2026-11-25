import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ats/fakeAts", async (orig) => {
  const actual = await orig<typeof import("../src/ats/fakeAts")>();
  return { ...actual, fetchPlacements: vi.fn() };
});

import { fetchPlacements } from "../src/ats/fakeAts";
import { createApp } from "../src/server";
import { createStore } from "../src/store";
import {
  compareRows,
  createComparisonLoader,
  formatChange,
  priorWeek,
  type ComparisonView,
} from "../web/src/compare";

const mocked = vi.mocked(fetchPlacements);
beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(async (t: string) => {
    const actual = await vi.importActual<typeof import("../src/ats/fakeAts")>("../src/ats/fakeAts");
    return actual.fetchPlacements(t, "key");
  });
});

const row = (clientId: string, gp: number) => ({
  clientId,
  clientName: clientId.toUpperCase(),
  revenueCents: gp,
  payCents: 0,
  burdenCents: 0,
  grossProfitCents: gp,
});
const ok = (...rows: ReturnType<typeof row>[]) => ({ status: 200, body: { rows } });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("priorWeek (rule 76)", () => {
  it.each([
    ["2026-11-09", "2026-11-02"],
    ["2026-03-02", "2026-02-23"],
    ["2026-01-01", "2025-12-25"],
  ])("%s -> %s", (a, b) => {
    expect(priorWeek(a)).toBe(b);
  });
});

describe("formatChange (rule 78)", () => {
  it.each([
    [-15520, "-$155.20"],
    [1234, "+$12.34"],
    [0, "$0.00"],
    [123456789, "+$1,234,567.89"],
  ])("%d -> %s", (n, s) => {
    expect(formatChange(n)).toBe(s);
  });
});

describe("compareRows (rule 77)", () => {
  it("subtracts matching clients, null when absent, ignores prior-only, keeps current order", () => {
    const current = [row("b", 500), row("a", 300), row("c", 100)];
    const prior = [row("a", 100), row("z", 999), row("b", 800)];
    const out = compareRows(current, prior);
    expect(out.map((r) => r.clientId)).toEqual(["b", "a", "c"]);
    expect(out.map((r) => r.change)).toEqual([-300, 200, null]);
    expect(out[0]).toMatchObject({ clientName: "B", grossProfitCents: 500 });
  });
});

describe("createComparisonLoader", () => {
  it("fetches week and prior week, Loading… until both resolve (rules 76, 79)", async () => {
    const cur = deferred<{ status: number; body: unknown }>();
    const pri = deferred<{ status: number; body: unknown }>();
    const fetchReport = vi.fn((w?: string) => (w === "2026-11-09" ? cur.promise : pri.promise));
    const changes = vi.fn();
    const loader = createComparisonLoader(fetchReport, changes);
    const p = loader.load("2026-11-09");
    expect(fetchReport.mock.calls.map((c) => c[0]).sort()).toEqual(["2026-11-02", "2026-11-09"]);
    expect(loader.view).toEqual({ kind: "loading", message: "Loading…" });
    cur.resolve(ok(row("a", 500)));
    await Promise.resolve();
    expect(loader.view).toEqual({ kind: "loading", message: "Loading…" });
    pri.resolve(ok(row("a", 200)));
    await p;
    expect(loader.view).toMatchObject({ kind: "table", rows: [{ clientId: "a", change: 300 }] });
    expect(changes).toHaveBeenCalled();
  });

  it("blank week: one fetch, no comparison (rule 76)", async () => {
    const fetchReport = vi.fn(async () => ok(row("a", 5)));
    const loader = createComparisonLoader(fetchReport);
    await loader.load("");
    expect(fetchReport).toHaveBeenCalledTimes(1);
    expect(loader.view).toEqual({ kind: "table", rows: [row("a", 5)] });
    await loader.load(undefined);
    expect(fetchReport).toHaveBeenCalledTimes(2);
  });

  it("blank week empty and error views match rule 66", async () => {
    const loader = createComparisonLoader(async () => ok());
    await loader.load("");
    expect(loader.view).toEqual({ kind: "empty", message: "No records found" });
  });

  it("selected week failure shows the report error, no table (rule 79)", async () => {
    const loader = createComparisonLoader(async (w) =>
      w === "2026-11-09" ? { status: 500, body: { error: "x" } } : ok(row("a", 1)),
    );
    await loader.load("2026-11-09");
    expect(loader.view).toEqual({ kind: "error", message: "Could not load report: x" });
  });

  it("prior week rejection keeps the table with null changes and a note (rule 79)", async () => {
    const loader = createComparisonLoader(async (w) => {
      if (w === "2026-11-02") throw new Error("net");
      return ok(row("a", 5), row("b", 3));
    });
    await loader.load("2026-11-09");
    const view = loader.view as ComparisonView;
    expect(view).toMatchObject({ kind: "table", note: "Could not load prior week: net" });
    expect((view as { rows: { change: number | null }[] }).rows.map((r) => r.change)).toEqual([null, null]);
  });

  it("prior week non-200 uses the error rule", async () => {
    const loader = createComparisonLoader(async (w) =>
      w === "2026-11-02" ? { status: 503, body: {} } : ok(row("a", 5)),
    );
    await loader.load("2026-11-09");
    expect(loader.view).toMatchObject({ kind: "table", note: "Could not load prior week: HTTP 503" });
  });

  it("successful table has no note", async () => {
    const loader = createComparisonLoader(async () => ok(row("a", 5)));
    await loader.load("2026-11-09");
    expect((loader.view as { note?: string }).note).toBeUndefined();
  });

  it("latest request wins when an earlier pair resolves last (rule 79)", async () => {
    const a = deferred<{ status: number; body: unknown }>();
    const fetchReport = vi.fn((w?: string) => {
      if (w === "2026-11-09" || w === "2026-11-02") return a.promise;
      return Promise.resolve(ok(row("b", 7)));
    });
    const loader = createComparisonLoader(fetchReport);
    const pa = loader.load("2026-11-09");
    const pb = loader.load("2026-12-14");
    await pb;
    const after = loader.view;
    expect(after).toMatchObject({ kind: "table", rows: [{ clientId: "b", change: 0 }] });
    a.resolve(ok(row("a", 1)));
    await pa;
    expect(loader.view).toBe(after);
  });

  it("reset() while pending clears the view and stays null (rule 81)", async () => {
    const d = deferred<{ status: number; body: unknown }>();
    const loader = createComparisonLoader(() => d.promise);
    const p = loader.load("2026-11-09");
    expect(loader.view).not.toBeNull();
    loader.reset();
    expect(loader.view).toBeNull();
    d.resolve(ok(row("a", 1)));
    await p;
    expect(loader.view).toBeNull();
  });
});

describe("fixture (rule 80)", () => {
  it("shows the expected changes for t_alpha", async () => {
    const app = createApp(createStore());
    await request(app).post("/api/sync").set("x-tenant-id", "t_alpha");
    const fetchReport = async (week?: string) => {
      const r = await request(app)
        .get(`/api/reports/gross-profit?week=${week}`)
        .set("x-tenant-id", "t_alpha");
      return { status: r.status, body: r.body as unknown };
    };
    const loader = createComparisonLoader(fetchReport);
    await loader.load("2026-11-09");
    const v1 = loader.view as Extract<ComparisonView, { kind: "table" }>;
    expect(v1.rows.map((r) => [r.clientName, formatChange(r.change as number)])).toEqual([
      ["Globex", "-$155.20"],
      ["Acme Corp", "-$179.00"],
    ]);
    await loader.load("2026-11-02");
    const v2 = loader.view as Extract<ComparisonView, { kind: "table" }>;
    expect(v2.kind).toBe("table");
    expect(v2.rows.map((r) => r.change)).toEqual([null, null]);
  });
});
