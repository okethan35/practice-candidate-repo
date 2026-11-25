import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const text = () => readFileSync(resolve(__dirname, "../README.md"), "utf8");

// The one sentence of the README that states the run history rule.
const statement = () =>
  text()
    .split(/(?<=[.!?])\s+/)
    .find((s) => /run history/i.test(s) && /every sync attempt/i.test(s));

describe("README run history", () => {
  it("mentions a run history", () => {
    expect(text()).toMatch(/run history/i);
  });

  it("says every sync attempt that runs is kept, ATS failures included", () => {
    const s = statement();
    expect(s).toBeDefined();
    expect(s).toMatch(/every sync attempt that runs, ATS failures included, is kept/i);
    expect(s).not.toMatch(/\b(only|not|never|dropped|excluded|except)\b/i);
  });

  it("says the run history is in memory", () => {
    expect(statement()).toMatch(/in[- ]memory run history/i);
  });

  it("says nothing displays it yet", () => {
    expect(text()).toMatch(/run history[^]*nothing displays it yet/i);
    expect(text()).not.toMatch(/ATS failures are (dropped|excluded|not)/i);
  });
});
