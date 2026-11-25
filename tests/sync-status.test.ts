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
  const sync = (tenant: string) => request(app).post("/api/sync").set("x-tenant-id", tenant);
  const status = (tenant?: string) => {
    const r = request(app).get("/api/sync/status");
    return tenant ? r.set("x-tenant-id", tenant) : r;
  };
  return { store, app, sync, status };
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(real);
});

const NULLS = { lastSyncedAt: null, lastRun: null };

describe("GET /api/sync/status", () => {
  it("rejects missing and unknown tenants (rule 34)", async () => {
    const { status } = setup();
    const a = await status();
    expect(a.status).toBe(401);
    expect(a.body).toEqual({ error: "missing x-tenant-id" });
    const b = await status("t_nope");
    expect(b.status).toBe(403);
    expect(b.body).toEqual({ error: "unknown tenant" });
  });

  it("never calls the ATS, changes state, or depends on query/body (rule 35)", async () => {
    const { app, sync, status, store } = setup();
    await sync("t_alpha");
    mocked.mockClear();
    const storeBefore = structuredClone(store);
    const histBefore = structuredClone(app.locals.syncRuns("t_alpha"));
    const a = await status("t_alpha");
    const b = await request(app).get("/api/sync/status?week=x").set("x-tenant-id", "t_alpha").send({ foo: 1 });
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(mocked).not.toHaveBeenCalled();
    expect(store).toEqual(storeBefore);
    expect(app.locals.syncRuns("t_alpha")).toEqual(histBefore);
    expect((await sync("t_alpha")).status).toBe(200);
  });

  it("returns nulls before the first sync, with exactly the two keys (rules 36-37)", async () => {
    const { status } = setup();
    for (const t of ["t_alpha", "t_beta"]) {
      const r = await status(t);
      expect(r.status).toBe(200);
      expect(r.body).toEqual(NULLS);
      expect(Object.keys(r.body).sort()).toEqual(["lastRun", "lastSyncedAt"]);
    }
  });

  it("reflects the last sync body plus finishedAt (rule 38)", async () => {
    const { sync, status } = setup();
    const post = await sync("t_alpha");
    const r = await status("t_alpha");
    expect(r.status).toBe(200);
    expect(r.body.lastRun).toEqual({ ...post.body, finishedAt: expect.any(String) });
    expect(r.body.lastSyncedAt).toBe(r.body.lastRun.finishedAt);
    expect(new Date(r.body.lastSyncedAt).toISOString()).toBe(r.body.lastSyncedAt);
    expect(r.body.lastRun.failed).toBe(1);
    expect(Object.keys(r.body.lastRun).sort()).toEqual(
      ["failed", "finishedAt", "inserted", "runId", "unchanged", "updated"],
    );
  });

  it("handles all-invalid and empty payloads (rule 38)", async () => {
    mocked.mockResolvedValueOnce([{}] as any);
    const { sync, status } = setup();
    const post = await sync("t_alpha");
    const r = await status("t_alpha");
    expect(r.body.lastSyncedAt).toEqual(expect.any(String));
    expect(r.body.lastRun).toEqual({ ...post.body, finishedAt: r.body.lastSyncedAt });
    expect(post.body).toMatchObject({ inserted: 0, updated: 0, unchanged: 0, failed: 1 });

    mocked.mockResolvedValueOnce([]);
    const post2 = await sync("t_beta");
    const r2 = await status("t_beta");
    expect(r2.body.lastSyncedAt).toEqual(expect.any(String));
    expect(r2.body.lastRun).toEqual({ ...post2.body, finishedAt: r2.body.lastSyncedAt });
    expect(post2.body).toMatchObject({ inserted: 0, updated: 0, unchanged: 0, failed: 0 });
  });

  it("is unchanged by a 502 (rule 39)", async () => {
    const { sync, status } = setup();
    mocked.mockRejectedValueOnce(new Error("boom"));
    expect((await sync("t_alpha")).status).toBe(502);
    expect((await status("t_alpha")).body).toEqual(NULLS);

    await sync("t_alpha");
    const before = (await status("t_alpha")).body;
    expect(before.lastRun).not.toBeNull();
    mocked.mockRejectedValueOnce(new Error("boom"));
    expect((await sync("t_alpha")).status).toBe(502);
    expect((await status("t_alpha")).body).toEqual(before);
  });

  it("returns identical bodies for repeated calls (rule 40)", async () => {
    const { sync, status } = setup();
    await sync("t_alpha");
    const a = await status("t_alpha");
    const b = await status("t_alpha");
    expect(b.body).toEqual(a.body);
  });

  it("answers 200 with the pre-sync state while a sync is in flight (rule 41)", async () => {
    const { sync, status } = setup();
    const pre = (await status("t_alpha")).body;
    expect(pre).toEqual(NULLS);
    let release!: (v: any[]) => void;
    mocked.mockReturnValueOnce(new Promise((r) => (release = r)));
    const inflight = sync("t_alpha").then((r) => r);
    await vi.waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    const during = await status("t_alpha");
    expect(during.status).toBe(200);
    expect(during.body).toEqual(pre);
    release([]);
    const post = await inflight;
    expect(post.status).toBe(200);
    const after = await status("t_alpha");
    expect(after.body.lastRun).toEqual({ ...post.body, finishedAt: expect.any(String) });
  });

  it("isolates tenants (rule 42)", async () => {
    const { sync, status } = setup();
    expect((await sync("t_alpha")).status).toBe(200);
    mocked.mockRejectedValueOnce(new Error("boom"));
    expect((await sync("t_alpha")).status).toBe(502);
    expect((await status("t_beta")).body).toEqual(NULLS);

    const alphaRunId = (await status("t_alpha")).body.lastRun.runId;
    expect((await sync("t_beta")).status).toBe(200);
    expect((await status("t_alpha")).body.lastRun.runId).toBe(alphaRunId);
    const beta = await status("t_beta");
    expect(beta.body.lastRun.runId).not.toBe(alphaRunId);
    expect(beta.body.lastRun.inserted).toBe(3);
  });
});
