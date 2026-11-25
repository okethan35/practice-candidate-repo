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
  return { store, app, sync };
}

const snap = (s: ReturnType<typeof createStore>) => structuredClone(s);

beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(real);
});

describe("POST /api/sync", () => {
  it("rejects missing and unknown tenants without calling the ATS", async () => {
    const { sync, store } = setup();
    const before = snap(store);
    const a = await sync();
    expect(a.status).toBe(401);
    expect(a.body).toEqual({ error: "missing x-tenant-id" });
    const b = await sync("t_nope");
    expect(b.status).toBe(403);
    expect(b.body).toEqual({ error: "unknown tenant" });
    expect(mocked).not.toHaveBeenCalled();
    expect(store).toEqual(before);
  });

  it("ignores the body", async () => {
    const { app } = setup();
    const r = await request(app).post("/api/sync").set("x-tenant-id", "t_alpha").send({ foo: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ inserted: 5, updated: 0, unchanged: 0, failed: 1 });
  });

  it("returns fixture counts and unique runIds", async () => {
    const { sync } = setup();
    const a = await sync("t_alpha");
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ runId: expect.any(String), inserted: 5, updated: 0, unchanged: 0, failed: 1 });
    expect(a.body.runId).not.toBe("");
    const b = await sync("t_beta");
    expect(b.body).toEqual({ runId: expect.any(String), inserted: 3, updated: 0, unchanged: 0, failed: 0 });
    expect(b.body.runId).not.toBe(a.body.runId);
    expect(mocked).toHaveBeenCalledWith("t_alpha");
    expect(a.body.inserted + a.body.updated + a.body.unchanged + a.body.failed).toBe(6);
  });

  it("second sync is idempotent", async () => {
    const { sync, store } = setup();
    await sync("t_alpha");
    const r = await sync("t_alpha");
    expect(r.body).toMatchObject({ inserted: 0, updated: 0, unchanged: 5, failed: 1 });
    expect(store.placements.filter((p) => p.tenantId === "t_alpha" && p.externalId)).toHaveLength(5);
  });

  it("empty payload returns zeros and records a run", async () => {
    mocked.mockResolvedValue([]);
    const { sync, store } = setup();
    const r = await sync("t_alpha");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ inserted: 0, updated: 0, unchanged: 0, failed: 0 });
    expect(store.syncState.t_alpha.latestRun?.runId).toBe(r.body.runId);
  });

  it("records the run and lastSyncedAt for the calling tenant only", async () => {
    const { sync, store } = setup();
    expect(store.syncState.t_alpha).toEqual({ lastSyncedAt: null, latestRun: null });
    const r = await sync("t_alpha");
    const run = store.syncState.t_alpha.latestRun!;
    expect(run).toEqual({ runId: r.body.runId, inserted: 5, updated: 0, unchanged: 0, failed: 1, finishedAt: expect.any(String) });
    expect(new Date(run.finishedAt).toISOString()).toBe(run.finishedAt);
    expect(store.syncState.t_alpha.lastSyncedAt).toBe(run.finishedAt);
    expect(store.syncState.t_beta).toEqual({ lastSyncedAt: null, latestRun: null });
  });

  it("502s on rejection and non-array payloads", async () => {
    const { sync } = setup();
    mocked.mockRejectedValueOnce(new Error("boom"));
    const a = await sync("t_alpha");
    expect(a.status).toBe(502);
    expect(a.body).toEqual({ error: "ATS request failed: boom" });
    mocked.mockResolvedValueOnce({} as any);
    const b = await sync("t_alpha");
    expect(b.status).toBe(502);
    expect(b.body).toEqual({ error: "ATS request failed: payload is not an array" });
  });

  it("writes nothing on a 502 after a successful sync", async () => {
    const { sync, store } = setup();
    await sync("t_alpha");
    const before = snap(store);
    mocked.mockRejectedValueOnce(new Error("boom"));
    expect((await sync("t_alpha")).status).toBe(502);
    expect(store).toEqual(before);
  });

  it("holds the per-tenant lock while in flight", async () => {
    const { sync, store } = setup();
    let release!: (v: any[]) => void;
    mocked.mockReturnValueOnce(new Promise((r) => (release = r)));
    const a = sync("t_alpha").then((r) => r);
    await vi.waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    const before = snap(store);
    const b = await sync("t_alpha");
    expect(b.status).toBe(409);
    expect(b.body).toEqual({ error: "sync already in progress" });
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(store).toEqual(before);
    release([]);
    expect((await a).status).toBe(200);
    expect((await sync("t_alpha")).status).toBe(200);
  });

  it("clears the lock after a failure", async () => {
    const { sync } = setup();
    let fail!: (e: Error) => void;
    mocked.mockReturnValueOnce(new Promise((_, rej) => (fail = rej)));
    const a = sync("t_alpha").then((r) => r);
    await vi.waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    fail(new Error("late"));
    expect((await a).status).toBe(502);
    expect((await sync("t_alpha")).status).toBe(200);
  });

  it("does not block other tenants", async () => {
    const { sync } = setup();
    let release!: (v: any[]) => void;
    mocked.mockReturnValueOnce(new Promise((r) => (release = r)));
    const a = sync("t_alpha").then((r) => r);
    await vi.waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    expect((await sync("t_beta")).status).toBe(200);
    release([]);
    expect((await a).status).toBe(200);
  });
});
