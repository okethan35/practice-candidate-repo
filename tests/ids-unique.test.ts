import { describe, it, expect } from "vitest";
import { newId } from "../src/lib/ids";

describe("newId uniqueness (rule 31)", () => {
  it("returns 10,000 distinct ids", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10000; i++) ids.add(newId("p"));
    expect(ids.size).toBe(10000);
  });

  it("keeps the prefix in the result", () => {
    const p = newId("p");
    const c = newId("c");
    expect(p.length).toBeGreaterThan(0);
    expect(c.length).toBeGreaterThan(0);
    expect(p).toContain("p");
    expect(c).toContain("c");
  });
});
