import { describe, expect, it } from "vitest";
import { newId } from "../src/lib/ids";

describe("newId", () => {
  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 8 }, () => newId("p")));
    expect(ids.size).toBe(8);
  });
});
