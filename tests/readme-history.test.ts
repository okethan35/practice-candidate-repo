import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const text = () => readFileSync(resolve(__dirname, "../README.md"), "utf8");

describe("README run history", () => {
  it("mentions a run history", () => {
    expect(text()).toMatch(/run history/i);
  });

  it("says the run history is in memory", () => {
    expect(text()).toMatch(/in[- ]memory run history/i);
  });

  it("says ATS failures are included", () => {
    expect(text()).toMatch(/ATS failures/i);
  });

  it("says nothing displays it yet", () => {
    expect(text()).toMatch(/nothing displays it yet/i);
  });
});
