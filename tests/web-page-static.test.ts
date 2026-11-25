import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(__dirname, "../web/src", p), "utf8");
const css = () => read("styles.css");

describe("styles.css (rules 82-84)", () => {
  it("scrolls the table horizontally inside its wrapper", () => {
    expect(css()).toContain("overflow-x: auto");
  });

  it("right-aligns money with tabular figures", () => {
    expect(css()).toContain("tabular-nums");
    expect(css()).toContain("text-align: right");
  });

  it("shows a focus ring with an outline", () => {
    expect(css()).toMatch(/:focus-visible[^{]*\{[^}]*outline/);
  });

  it("has no width or min-width above 360px", () => {
    const re = /(?:^|[\s;{])(?:min-)?width\s*:\s*([\d.]+)\s*(px|rem|em)/g;
    for (const m of css().matchAll(re)) {
      const px = m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16;
      expect(px).toBeLessThanOrEqual(360);
    }
  });

  it("uses no hex colors", () => {
    expect(css()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("page source (rule 82, 75)", () => {
  it("main.tsx injects themeCss and imports styles.css", () => {
    const m = read("main.tsx");
    expect(m).toContain("themeCss");
    expect(m).toContain("styles.css");
  });

  it("App.tsx has no appearance toggle", () => {
    const a = read("App.tsx");
    expect(a).not.toContain("localStorage");
    expect(a).not.toContain("data-theme");
  });

  it("App.tsx does not render the raw sync response", () => {
    expect(read("App.tsx")).not.toMatch(/<pre[\s>]/);
  });
});
