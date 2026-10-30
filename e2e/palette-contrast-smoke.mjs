import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const tokens = (source) => Object.fromEntries([...source.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6})/gi)].map((m) => [m[1], m[2]]));
const base = tokens(css.slice(css.indexOf("@theme"), css.indexOf(":root {")));
const lightStart = css.indexOf(':root[data-theme="light"],');
const systemStart = css.indexOf("@media (prefers-color-scheme: dark)");
const themes = {
  dark: base,
  light: { ...base, ...tokens(css.slice(lightStart, systemStart)) },
  systemDark: { ...base, ...tokens(css.slice(systemStart, css.indexOf("@layer base"))) },
};
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((n) => parseInt(n, 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
for (const [name, palette] of Object.entries(themes)) {
  const pairs = [
    ...["ink", "ink-muted", "ink-subtle"].flatMap((ink) => ["surface", "surface-sunken", "surface-muted", "surface-raised"].map((surface) => [ink, surface])),
    ["brand-ink", "brand-soft"], ["ink-inverse", "primary"], ["ink-inverse", "primary-hover"],
    ...["success", "warning", "danger", "info"].map((status) => [status, `${status}-soft`]),
  ];
  for (const [foreground, background] of pairs) {
    const a = luminance(palette[foreground]); const b = luminance(palette[background]);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(ratio >= 4.5, `${name}: ${foreground}/${background} only ${ratio.toFixed(2)}:1`);
  }
  console.log(`PASS ${name}: ${pairs.length} text/background pairs meet 4.5:1`);
}
