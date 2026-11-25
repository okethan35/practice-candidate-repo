import { describe, expect, it } from "vitest";
import { contrastRatio, textPairs, themeCss, tokens } from "../web/src/theme";

describe("contrastRatio", () => {
  it("computes black on white as 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });
  it("computes #999999 on white as about 2.85", () => {
    const r = contrastRatio("#999999", "#ffffff");
    expect(r).toBeCloseTo(2.85, 2);
    expect(r).toBeLessThan(4.5);
  });
});

describe("tokens", () => {
  it("has a light and a dark value for every token", () => {
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(8);
    for (const [name, v] of Object.entries(tokens)) {
      expect(v.light, name).toMatch(/^#[0-9a-f]{6}$/i);
      expect(v.dark, name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("every declared text/background pair has at least 4.5:1 in both appearances", () => {
    expect(textPairs.length).toBeGreaterThan(0);
    for (const [fg, bg] of textPairs) {
      for (const mode of ["light", "dark"] as const) {
        const r = contrastRatio(tokens[fg][mode], tokens[bg][mode]);
        expect(r, `${fg} on ${bg} (${mode})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("themeCss", () => {
  const css = themeCss();
  it("follows the system appearance", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("color-scheme: light dark");
    expect(css).toContain(":root");
  });
  it("declares a custom property for every token in light and dark", () => {
    const [light, dark] = css.split("@media (prefers-color-scheme: dark)");
    for (const [name, v] of Object.entries(tokens)) {
      expect(light).toContain(`--${name}: ${v.light};`);
      expect(dark).toContain(`--${name}: ${v.dark};`);
    }
  });
});
