import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateAtsRecord } from "../src/sync/validate";
import { clientDisplayName, clientKey } from "../src/sync/clientKey";

const feed = JSON.parse(readFileSync(new URL("../fixtures/ats-feed.json", import.meta.url), "utf8"));
const base = {
  external_id: "A-1",
  client_name: "Acme Corp",
  worker_name: "Sam",
  bill_rate: 10,
  pay_rate: 5,
  hours: 8,
  week_start: "2026-11-02",
};
const ok = (r: unknown) => validateAtsRecord(r).valid;

describe("validateAtsRecord", () => {
  it("accepts A-1001 and rejects A-1006", () => {
    expect(ok(feed.t_alpha[0])).toBe(true);
    expect(ok(feed.t_alpha[5])).toBe(false);
  });

  it.each(["external_id", "client_name", "worker_name", "week_start"])("rejects bad %s", (f) => {
    for (const bad of [undefined, "", "   ", 5, null]) {
      expect(ok({ ...base, [f]: bad })).toBe(false);
    }
  });

  it("rejects non-object input", () => {
    for (const bad of [null, undefined, 5, "x", [], [base]]) expect(ok(bad)).toBe(false);
  });

  it("rejects numeric strings and non-finite or negative numbers", () => {
    expect(ok({ ...base, bill_rate: "42.1" })).toBe(false);
    for (const f of ["bill_rate", "pay_rate", "hours"]) {
      for (const bad of [-1, NaN, Infinity, -Infinity, undefined, null]) {
        expect(ok({ ...base, [f]: bad })).toBe(false);
      }
    }
  });

  it("validates week_start format and calendar", () => {
    for (const bad of ["2026-02-30", "2026-11-2", "2026/11/02", "2026-11-02T00:00"]) {
      expect(ok({ ...base, week_start: bad })).toBe(false);
    }
    expect(ok({ ...base, week_start: "2026-11-04" })).toBe(true);
  });

  it("accepts zeros and bill below pay", () => {
    expect(ok({ ...base, hours: 0 })).toBe(true);
    expect(ok({ ...base, bill_rate: 0 })).toBe(true);
    expect(ok({ ...base, bill_rate: 10, pay_rate: 20 })).toBe(true);
  });

  it("drops notes and unknown fields", () => {
    const r = validateAtsRecord({ ...base, notes: 123, foo: 1 });
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.record).not.toHaveProperty("notes");
      expect(r.record).not.toHaveProperty("foo");
    }
  });

  it("trims external_id and worker_name", () => {
    const r = validateAtsRecord({ ...base, external_id: " A-1 ", worker_name: " Sam " });
    expect(r.valid && r.record.external_id).toBe("A-1");
    expect(r.valid && r.record.worker_name).toBe("Sam");
  });

  it("rejects a client_name with an empty key", () => {
    expect(ok({ ...base, client_name: "!!!" })).toBe(false);
  });
});

describe("clientKey", () => {
  it("normalizes variants to the same key", () => {
    for (const n of ["Acme Corp", "ACME CORP", "  Acme Corp ", "Acme Corp.", "Acme - Corp"]) {
      expect(clientKey(n)).toBe("acme corp");
    }
  });
  it("handles punctuation and unicode", () => {
    expect(clientKey("AT&T")).toBe("att");
    expect(clientKey("Café")).toBe("café");
  });
});

describe("clientDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(clientDisplayName("  Hooli   Inc ")).toBe("Hooli Inc");
  });
});
