import { describe, expect, it, vi } from "vitest";
import { getStatus } from "../web/src/api";
import {
  countsLine,
  createStatusLoader,
  formatLastSynced,
  statusViewFor,
  syncMessageFor,
} from "../web/src/status";

const lastRun = {
  runId: "r1",
  inserted: 5,
  updated: 0,
  unchanged: 0,
  failed: 1,
  finishedAt: "2026-11-25T23:42:00.000Z",
};

describe("getStatus (rule 71)", () => {
  it("calls /api/sync/status with the tenant header", async () => {
    const f = vi.fn(async (_url: string, _init?: unknown) => ({
      status: 200,
      json: async () => ({ lastSyncedAt: null, lastRun: null }),
    }));
    const r = await getStatus(f, "t_beta");
    const [url, init] = f.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("/api/sync/status");
    expect(init.headers["x-tenant-id"]).toBe("t_beta");
    expect(r).toEqual({ status: 200, body: { lastSyncedAt: null, lastRun: null } });
  });

  it("returns undefined body when json fails", async () => {
    const f = vi.fn(async () => ({
      status: 500,
      json: async () => {
        throw new Error("bad json");
      },
    }));
    expect(await getStatus(f, "t_alpha")).toEqual({ status: 500, body: undefined });
  });
});

describe("formatLastSynced (rule 72)", () => {
  it("formats in US English with 12-hour time", () => {
    expect(formatLastSynced("2026-11-25T23:42:00.000Z", "UTC")).toBe(
      "Last synced Nov 25, 2026, 11:42 PM",
    );
  });
  it("respects the time zone", () => {
    expect(formatLastSynced("2026-11-25T23:42:00.000Z", "America/New_York")).toBe(
      "Last synced Nov 25, 2026, 6:42 PM",
    );
  });
  it("shows Never synced for null", () => {
    expect(formatLastSynced(null)).toBe("Never synced");
  });
});

describe("countsLine (rule 73)", () => {
  it("shows all four counts including zeros", () => {
    expect(countsLine(lastRun)).toBe("5 inserted · 0 updated · 0 unchanged · 1 failed");
  });
  it("is null without a last run", () => {
    expect(countsLine(null)).toBeNull();
  });
});

describe("statusViewFor (rule 74)", () => {
  it("pending shows Loading…", () => {
    expect(statusViewFor({ kind: "pending" })).toEqual({ kind: "loading", message: "Loading…" });
  });
  it("500 with error body", () => {
    expect(statusViewFor({ kind: "response", status: 500, body: { error: "boom" } })).toEqual({
      kind: "error",
      message: "Could not load sync status: boom",
    });
  });
  it("500 without body", () => {
    expect(statusViewFor({ kind: "response", status: 500, body: undefined })).toEqual({
      kind: "error",
      message: "Could not load sync status: HTTP 500",
    });
  });
  it("network failure", () => {
    expect(statusViewFor({ kind: "failed", error: new Error("net") })).toEqual({
      kind: "error",
      message: "Could not load sync status: net",
    });
  });
  it("200 shows last-synced text and counts", () => {
    expect(
      statusViewFor({
        kind: "response",
        status: 200,
        body: { lastSyncedAt: lastRun.finishedAt, lastRun },
      }),
    ).toEqual({
      kind: "status",
      lastSynced: formatLastSynced(lastRun.finishedAt),
      counts: "5 inserted · 0 updated · 0 unchanged · 1 failed",
    });
  });
  it("200 never synced has no counts line", () => {
    expect(
      statusViewFor({ kind: "response", status: 200, body: { lastSyncedAt: null, lastRun: null } }),
    ).toEqual({ kind: "status", lastSynced: "Never synced", counts: null });
  });
});

describe("syncMessageFor (rule 75)", () => {
  it("200 shows no message", () => {
    expect(syncMessageFor({ kind: "response", status: 200, body: { inserted: 1 } })).toBeNull();
  });
  it("409 shows the error", () => {
    expect(
      syncMessageFor({
        kind: "response",
        status: 409,
        body: { error: "sync already in progress" },
      }),
    ).toBe("Sync failed: sync already in progress");
  });
  it("502 without body", () => {
    expect(syncMessageFor({ kind: "response", status: 502, body: undefined })).toBe(
      "Sync failed: HTTP 502",
    );
  });
  it("network failure", () => {
    expect(syncMessageFor({ kind: "failed", error: new Error("net") })).toBe("Sync failed: net");
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createStatusLoader (rules 71, 81)", () => {
  const ok = (iso: string | null) => ({
    status: 200,
    body: { lastSyncedAt: iso, lastRun: null },
  });

  it("shows loading while pending, then the result", async () => {
    const d = deferred<{ status: number; body: unknown }>();
    const onChange = vi.fn();
    const loader = createStatusLoader(() => d.promise, onChange);
    expect(loader.view).toBeNull();
    const p = loader.load();
    expect(loader.view).toEqual({ kind: "loading", message: "Loading…" });
    d.resolve(ok(null));
    await p;
    expect(loader.view).toEqual({ kind: "status", lastSynced: "Never synced", counts: null });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("only the latest load is shown", async () => {
    const first = deferred<{ status: number; body: unknown }>();
    const second = deferred<{ status: number; body: unknown }>();
    const queue = [first, second];
    const loader = createStatusLoader(() => queue.shift()!.promise);
    const p1 = loader.load();
    const p2 = loader.load();
    second.resolve(ok(null));
    await p2;
    first.resolve({ status: 500, body: { error: "old" } });
    await p1;
    expect(loader.view).toEqual({ kind: "status", lastSynced: "Never synced", counts: null });
  });

  it("reset clears the view and discards a pending response", async () => {
    const d = deferred<{ status: number; body: unknown }>();
    const onChange = vi.fn();
    const loader = createStatusLoader(() => d.promise, onChange);
    const p = loader.load();
    loader.reset();
    expect(loader.view).toBeNull();
    d.resolve(ok(null));
    await p;
    expect(loader.view).toBeNull();
    expect(onChange).toHaveBeenCalled();
  });

  it("a rejected fetch becomes an error view", async () => {
    const loader = createStatusLoader(async () => {
      throw new Error("net");
    });
    await loader.load();
    expect(loader.view).toEqual({ kind: "error", message: "Could not load sync status: net" });
  });
});
