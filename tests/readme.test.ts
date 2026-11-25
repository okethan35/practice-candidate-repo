import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(__dirname, "../README.md");
const read = () => readFileSync(path, "utf8");

describe("README sync behavior", () => {
  it("exists", () => {
    expect(existsSync(path)).toBe(true);
  });

  it("says the store is in memory and data is lost on restart", () => {
    const text = read().toLowerCase();
    expect(text).toContain("in memory");
    expect(text).toMatch(/lost on restart/);
  });

  it("says an invalid record keeps its last valid version and counts as failed", () => {
    const text = read().toLowerCase();
    expect(text).toContain("invalid");
    expect(text).toContain("last valid version");
    expect(text).toContain("failed");
  });

  it("says client names are merged ignoring punctuation, case and whitespace", () => {
    const text = read();
    expect(text.toLowerCase()).toMatch(/punctuation, case,? and whitespace/);
    expect(text).toContain('"Acme Corp."');
    expect(text).toContain('"ACME CORP"');
  });
});
