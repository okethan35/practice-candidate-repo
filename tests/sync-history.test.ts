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
  const sync = (tenant?: string) => {
    const r = request(app).post("/api/sync");
    return tenant ? r.set("x-tenant-id", tenant) : r;
  };
  const runs = (t: string) => (app.locals.syncRuns as (t: string) => any[])(t);
  return { store, app, sync, runs };
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(real);
});

describe("sync run history", () => {
  it("starts empty and returns a copy", () => {
    const { runs } = setup();
    expect(runs("t_alpha")).toEqual([]);
    runs("t_alpha").push({ x: 1 });
    expect(runs("t_alpha")).toEqual([]);
  });

  it("keeps separate histories per app on the same store", async () => {
    const store = createStore();
    const a = createApp(store);
    const b = createApp(store);
    await request(a).post("/api/sync").set("x-tenant-id", "t_alpha");
    expect(a.locals.syncRuns("t_alpha")).toHaveLength(1);
    expect(b.locals.syncRuns("t_alpha")).toEqual([]);
  });

  it("records a success entry equal to the latest run", async () => {
    const { sync, store, runs } = setup();
    expect((await sync("t_alpha")).status).toBe(200);
    const h = runs("t_alpha");
    expect(h).toHaveLength(1);
    expect(h[0]).toEqual({ ...store.syncState.t_alpha.latestRun, outcome: "success" });
  });

  it("records a failed entry when the ATS rejects", async () => {
    mocked.mockRejectedValueOnce(new Error("boom"));
    const { sync, runs } = setup();
    const r = await sync("t_alpha");
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: "ATS request failed: boom" });
    const h = runs("t_alpha");
    expect(h).toEqual([
      {
        runId: expect.any(String),
        outcome: "failed",
        error: "ATS request failed: boom",
        finishedAt: expect.any(String),
      },
    ]);
    expect(h[0].runId).not.toBe("");
    expect(new Date(h[0].finishedAt).toISOString()).toBe(h[0].finishedAt);
  });

  it("records a failed entry for a non-array payload", async () => {
    mocked.mockResolvedValueOnce({} as any);
    const { sync, runs } = setup();
    const r = await sync("t_alpha");
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: "ATS request failed: payload is not an array" });
    expect(runs("t_alpha")[0]).toMatchObject({
      outcome: "failed",
      error: "ATS request failed: payload is not an array",
    });
  });

  it("502 leaves the store unchanged but grows the history", async () => {
    const { sync, store, runs } = setup();
    await sync("t_alpha");
    const before = structuredClone(store);
    mocked.mockRejectedValueOnce(new Error("boom"));
    expect((await sync("t_alpha")).status).toBe(502);
    expect(store).toEqual(before);
    expect(runs("t_alpha")).toHaveLength(2);
  });

  it("keeps entries oldest first", async () => {
    const { sync, runs } = setup();
    await sync("t_alpha");
    mocked.mockRejectedValueOnce(new Error("boom"));
    await sync("t_alpha");
    await sync("t_alpha");
    expect(runs("t_alpha").map((e) => e.outcome)).toEqual(["success", "failed", "success"]);
  });

  it("appends nothing on 401 and 403", async () => {
    const { sync, runs } = setup();
    expect((await sync()).status).toBe(401);
    expect((await sync("t_nope")).status).toBe(403);
    for (const t of ["t_alpha", "t_beta", "t_nope"]) expect(runs(t)).toEqual([]);
  });

  it("appends nothing on 409", async () => {
    const { sync, runs } = setup();
    let release!: (v: any[]) => void;
    mocked.mockReturnValueOnce(new Promise((r) => (release = r)));
    const a = sync("t_alpha").then((r) => r);
    await vi.waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    expect((await sync("t_alpha")).status).toBe(409);
    release([]);
    expect((await a).status).toBe(200);
    expect(runs("t_alpha")).toHaveLength(1);
  });

  it("never appends to another tenant", async () => {
    const { sync, runs } = setup();
    await sync("t_alpha");
    mocked.mockRejectedValueOnce(new Error("boom"));
    await sync("t_alpha");
    expect(runs("t_alpha")).toHaveLength(2);
    expect(runs("t_beta")).toEqual([]);
  });
});
