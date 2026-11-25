export type TokenName =
  | "surface"
  | "surfaceRaised"
  | "text"
  | "textSecondary"
  | "accent"
  | "accentText"
  | "dangerText"
  | "border";

export const tokens: Record<TokenName, { light: string; dark: string }> = {
  surface: { light: "#ffffff", dark: "#121417" },
  surfaceRaised: { light: "#f3f5f8", dark: "#1c2026" },
  text: { light: "#16191d", dark: "#eceff3" },
  textSecondary: { light: "#4a5260", dark: "#aab2bf" },
  accent: { light: "#1f5fd1", dark: "#6ea2ff" },
  accentText: { light: "#ffffff", dark: "#0b1220" },
  dangerText: { light: "#b3261e", dark: "#ff8a80" },
  border: { light: "#c4cad4", dark: "#3a414c" },
};

/** [foreground, background] token pairs the page renders as text. */
export const textPairs: ReadonlyArray<readonly [TokenName, TokenName]> = [
  ["text", "surface"],
  ["text", "surfaceRaised"],
  ["textSecondary", "surface"],
  ["textSecondary", "surfaceRaised"],
  ["accentText", "accent"],
  ["accent", "surface"],
  ["dangerText", "surface"],
  ["dangerText", "surfaceRaised"],
];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function themeCss(): string {
  const entries = Object.entries(tokens) as [TokenName, { light: string; dark: string }][];
  const lines = (mode: "light" | "dark", indent: string) =>
    entries.map(([n, v]) => `${indent}--${n}: ${v[mode]};`).join("\n");
  return [
    ":root {",
    "  color-scheme: light dark;",
    lines("light", "  "),
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    lines("dark", "    "),
    "  }",
    "}",
    "",
  ].join("\n");
}
