import { describe, expect, it } from "vitest";
import {
  checkWeek,
  createReportLoader,
  formatCents,
  viewFor,
  type ReportView,
} from "../web/src/report";

const HINT = "No records found. Use YYYY-MM-DD, e.g. 2026-11-02.";

const row = (clientId: string, gp: number) => ({
  clientId,
  clientName: clientId,
  revenueCents: gp,
  payCents: 0,
  burdenCents: 0,
  grossProfitCents: gp,
});

describe("checkWeek (rule 65)", () => {
  it("trims a real date and returns it", () => {
    expect(checkWeek(" 2026-11-02 ")).toEqual({ kind: "valid", week: "2026-11-02" });
  });
  it("treats blank input as all weeks", () => {
    expect(checkWeek("")).toEqual({ kind: "blank" });
    expect(checkWeek("   ")).toEqual({ kind: "blank" });
  });
  it.each(["2026-02-30", "2026-11-2", "banana"])("rejects %s with the hint", (v) => {
    expect(checkWeek(v)).toEqual({ kind: "invalid", message: HINT });
  });
});

describe("formatCents (rule 67)", () => {
  it("formats dollars with separators and two decimals", () => {
    expect(formatCents(101920)).toBe("$1,019.20");
    expect(formatCents(-1234)).toBe("-$12.34");
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("viewFor (rule 66)", () => {
  it("shows Loading… while pending", () => {
    expect(viewFor({ kind: "pending" })).toEqual({ kind: "loading", message: "Loading…" });
  });
  it("shows No records found for empty rows", () => {
    expect(viewFor({ kind: "response", status: 200, body: { rows: [] } })).toEqual({
      kind: "empty",
      message: "No records found",
    });
  });
  it("uses the body error for a non-200", () => {
    expect(
      viewFor({ kind: "response", status: 403, body: { error: "unknown tenant" } }),
    ).toEqual({ kind: "error", message: "Could not load report: unknown tenant" });
  });
  it("falls back to HTTP status when there is no error", () => {
    expect(viewFor({ kind: "response", status: 500, body: undefined })).toEqual({
      kind: "error",
      message: "Could not load report: HTTP 500",
    });
  });
  it("shows a network failure message", () => {
    expect(viewFor({ kind: "failed", error: new Error("offline") })).toEqual({
      kind: "error",
      message: "Could not load report: offline",
    });
  });
  it("shows a table with rows in the given order", () => {
    const rows = [row("b", 5), row("a", 9)];
    expect(viewFor({ kind: "response", status: 200, body: { rows } })).toEqual({
      kind: "table",
      rows,
    });
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Resp = { status: number; body: unknown };

describe("report loader (rule 68)", () => {
  it("is pending while a load is in flight", () => {
    const a = deferred<Resp>();
    const loader = createReportLoader(() => a.promise);
    void loader.load();
    expect(loader.view).toEqual({ kind: "loading", message: "Loading…" });
  });

  it("shows only the latest load even when an earlier one resolves last", async () => {
    const a = deferred<Resp>();
    const b = deferred<Resp>();
    const queue = [a, b];
    const loader = createReportLoader(() => queue.shift()!.promise);
    const pa = loader.load();
    const pb = loader.load();
    b.resolve({ status: 200, body: { rows: [row("B", 2)] } });
    await pb;
    a.resolve({ status: 200, body: { rows: [row("A", 1)] } });
    await pa;
    expect(loader.view).toEqual({ kind: "table", rows: [row("B", 2)] });
  });

  it("discards an earlier failure that arrives after the latest load", async () => {
    const a = deferred<Resp>();
    const b = deferred<Resp>();
    const queue = [a, b];
    const loader = createReportLoader(() => queue.shift()!.promise);
    const pa = loader.load();
    const pb = loader.load();
    b.resolve({ status: 200, body: { rows: [] } });
    await pb;
    a.reject(new Error("late"));
    await pa;
    expect(loader.view).toEqual({ kind: "empty", message: "No records found" });
  });

  it("works normally after a load ended in an error", async () => {
    let n = 0;
    const loader = createReportLoader(async () => {
      if (n++ === 0) throw new Error("offline");
      return { status: 200, body: { rows: [row("A", 1)] } };
    });
    await loader.load();
    expect((loader.view as ReportView).kind).toBe("error");
    await loader.load();
    expect(loader.view).toEqual({ kind: "table", rows: [row("A", 1)] });
  });

  it("notifies on change", async () => {
    const seen: string[] = [];
    const loader = createReportLoader(
      async () => ({ status: 200, body: { rows: [] } }),
      () => seen.push(loader.view!.kind),
    );
    await loader.load();
    expect(seen).toEqual(["loading", "empty"]);
  });
});
