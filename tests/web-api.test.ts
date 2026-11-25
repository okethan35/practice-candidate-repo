import { describe, expect, it, vi } from "vitest";
import { getReport, postSync } from "../web/src/api";
import { createSyncButton } from "../web/src/syncButton";
import { createReportLoader } from "../web/src/report";

function fakeFetch(status = 200, body: unknown = { rows: [] }) {
  return vi.fn(async (_url: string, _init?: unknown) => ({
    status,
    json: async () => body,
  }));
}

describe("web api (rules 63, 64)", () => {
  it("getReport omits week when blank and sends tenant header", async () => {
    const f = fakeFetch();
    await getReport(f, "t_beta", "");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("/api/reports/gross-profit");
    expect(init.headers["x-tenant-id"]).toBe("t_beta");
  });

  it("getReport sends week and tenant header", async () => {
    const f = fakeFetch();
    await getReport(f, "t_alpha", "2026-11-02");
    const [url, init] = f.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("/api/reports/gross-profit?week=2026-11-02");
    expect(init.headers["x-tenant-id"]).toBe("t_alpha");
  });

  it("getReport url-encodes the week", async () => {
    const f = fakeFetch();
    await getReport(f, "t_alpha", "a&b c");
    expect(f.mock.calls[0][0]).toBe("/api/reports/gross-profit?week=a%26b%20c");
  });

  it("getReport returns status and parsed body", async () => {
    const f = fakeFetch(403, { error: "unknown tenant" });
    expect(await getReport(f, "t_alpha", "")).toEqual({
      status: 403,
      body: { error: "unknown tenant" },
    });
  });

  it("postSync sends POST /api/sync with tenant header", async () => {
    const f = fakeFetch();
    await postSync(f, "t_beta");
    const [url, init] = f.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string> },
    ];
    expect(url).toBe("/api/sync");
    expect(init.method).toBe("POST");
    expect(init.headers["x-tenant-id"]).toBe("t_beta");
  });

  it("a sync started on t_alpha that resolves after switching to t_beta reloads t_beta", async () => {
    let tenant = "t_alpha";
    const f = fakeFetch();
    const loader = createReportLoader((week) => getReport(f, tenant, week ?? ""));
    let resolveSync!: () => void;
    const syncDone = new Promise<void>((r) => (resolveSync = r));
    const button = createSyncButton(async () => {
      await syncDone;
      await loader.load(""); // tenant read at resolve time
    });
    const p = button.click();
    tenant = "t_beta";
    resolveSync();
    await p;
    const [, init] = f.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers["x-tenant-id"]).toBe("t_beta");
  });
});
