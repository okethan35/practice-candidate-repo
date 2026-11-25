import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const text = () => readFileSync(resolve(__dirname, "../README.md"), "utf8");

// Text under the first heading that mentions "cut" or "not done".
const cutSection = () => {
  const parts = text().split(/^(?=#{1,6}\s)/m);
  return parts.find((p) => /^#{1,6}\s.*\b(cut|not done)\b/i.test(p)) ?? "";
};

describe("README web app", () => {
  it("has the web run steps", () => {
    const t = text();
    expect(t).toContain("cd web");
    expect(t).toContain("npm install");
    expect(t).toContain("npm run dev");
    expect(t).toContain("3000");
  });

  it("lists pagination under a cut heading", () => {
    expect(cutSection()).toMatch(/pagination/i);
  });

  it("lists the exact integer range under a cut heading", () => {
    const s = cutSection();
    expect(s).toMatch(/90 trillion/i);
    expect(s).toMatch(/exact integer/i);
  });
});
