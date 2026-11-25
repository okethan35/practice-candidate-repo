import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const text = () => readFileSync(resolve(__dirname, "../README.md"), "utf8");

describe("README week comparison and appearance (rule 86)", () => {
  it("names the vs prior week column and the 7 days gap", () => {
    expect(text()).toContain("vs prior week");
    expect(text()).toContain("7 days");
  });

  it("says the column shows only when a week is selected", () => {
    expect(text()).toMatch(/only when a week is selected/i);
  });

  it("says the page follows the system light or dark appearance", () => {
    expect(text()).toMatch(/follows the system light or dark appearance/i);
  });
});
