/**
 * The brand, and the rule that keeps it one brand.
 *
 * Every colour in the application comes from a token in app/globals.css. This
 * guards that: a screen that reaches for a hex value or a Tailwind palette
 * colour of its own is how an application ends up with four different greys
 * and a yellow that is nearly but not quite the brand's.
 *
 * Needs neither Supabase nor a browser.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(path.join(root, file), "utf8");

function walk(dir, out = []) {
  for (const entry of readdirSync(path.join(root, dir))) {
    const relative = path.join(dir, entry);
    if (statSync(path.join(root, relative)).isDirectory()) walk(relative, out);
    else if (/\.tsx?$/.test(entry)) out.push(relative);
  }
  return out;
}
const sources = [...walk("app"), ...walk("components")];

console.log("\n1. The palette is the brand sheet's");
const css = read("app/globals.css");
for (const [name, value] of [
  ["charcoal", "#0d0f12"],
  ["dark grey", "#1a1d23"],
  ["medium grey", "#2a2e36"],
  ["SiteBoss gold", "#ffc107"],
  ["white", "#ffffff"],
]) {
  check(`${name} ${value} is a token`, css.includes(value), value);
}
check("the page is charcoal", /--color-surface-sunken:\s*#0d0f12/.test(css));
check("a card is the dark grey", /--color-surface:\s*#1a1d23/.test(css));
check("gold is the brand", /--color-brand:\s*#ffc107/.test(css));
check("and the one primary action", /--color-primary:\s*#ffc107/.test(css));
check("text on gold is charcoal, never white", /--color-ink-inverse:\s*#0d0f12/.test(css));
check("the browser draws its own furniture dark", /color-scheme:\s*dark/.test(css));
check("focus is gold, so it is findable on charcoal", /:focus-visible[\s\S]{0,80}var\(--color-brand\)/.test(css));

console.log("\n2. No screen picks its own colours");
const HEX = /(?:bg|text|border|ring|fill|stroke|from|to|via|shadow|accent|outline|decoration|divide)-\[#[0-9a-fA-F]{3,8}\]/;
// Tailwind's own palette, which would drift away from the tokens.
const PALETTE =
  /\b(?:bg|text|border|ring|fill|accent|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const offenders = [];
for (const file of sources) {
  // The mark is drawn, not themed: an SVG logo carries its own colours so it
  // is the same object on a home screen, in a tab and on a client's laptop.
  if (file.includes("brand/monogram")) continue;
  const source = read(file);
  const hex = HEX.exec(source);
  const palette = PALETTE.exec(source);
  if (hex) offenders.push(`${file}: ${hex[0]}`);
  if (palette) offenders.push(`${file}: ${palette[0]}`);
}
check("no hard-coded hex utility anywhere", offenders.length === 0, offenders.slice(0, 4).join(", "));
check("something was actually scanned", sources.length > 40, String(sources.length));

console.log("\n3. Gold is an accent, not a background");
// A gold fill is legitimate on exactly two things: the one primary action per
// screen, and the mark. Anything else would be a field of yellow.
const goldFills = sources.flatMap((file) => {
  const source = read(file);
  return [...source.matchAll(/className="[^"]*\bbg-(?:brand|primary)\b[^"]*"/g)].map(
    () => file,
  );
});
check(
  "gold fills are few and deliberate",
  goldFills.length <= 8,
  `${goldFills.length}: ${[...new Set(goldFills)].join(", ")}`,
);
check(
  "and nothing puts white type on gold",
  !sources.some((file) =>
    /bg-(?:brand|primary)(?![-a-z])[^"]*text-ink(?![-a-z])/.test(read(file)),
  ),
);

console.log("\n4. The mark reads as SB");
const monogram = read("components/brand/monogram.tsx");
check("it is drawn, not set in a font", !/<text/.test(monogram) && /<path/.test(monogram));
// White on the charcoal plate; the page's own ink when it stands on the page,
// so the light theme gets the dark-S mark the brand sheet draws.
check("the S is white on the plate", /plate \? "#ffffff"/.test(monogram));
check("and follows the ink without it", /var\(--color-ink, #ffffff\)/.test(monogram));
check("the B is gold, so the two letters cannot merge", /fill="#ffc107"/.test(monogram));
check("and it carries the three bars", (monogram.match(/M\d+ 100h18/g) ?? []).length === 3);
check("it names itself for a screen reader", /aria-label=\{title\}/.test(monogram));
const wordmark = read("components/brand/wordmark.tsx");
check("the wordmark uses the mark rather than a second drawing", /<Monogram/.test(wordmark));
check(
  "SITE takes the ink and BOSS the gold",
  /SITE<span className="text-brand-ink">BOSS<\/span>/.test(wordmark),
);
check("and the strapline is the company's", /REPORT IT\. PROVE IT\. MOVE FORWARD\./.test(wordmark));

console.log("\n5. It installs to a home screen as SiteBoss");
const manifest = read("app/manifest.ts");
check("there is a manifest", /export default function manifest/.test(manifest));
check("it is called SiteBoss", /short_name: "SiteBoss"/.test(manifest));
check("it opens standalone, not in a tab", /display: "standalone"/.test(manifest));
check("on charcoal, so it does not flash white", /background_color: "#0d0f12"/.test(manifest));
check("with a maskable icon for Android", /purpose: "maskable"/.test(manifest));
const layout = read("app/layout.tsx");
check("the status bar matches the app", /themeColor: "#0d0f12"/.test(layout));
check("iOS treats it as an app", /appleWebApp/.test(layout));
for (const icon of [
  "app/icon.svg",
  "app/icon.png",
  "app/apple-icon.png",
  "public/icon-192.png",
  "public/icon-512.png",
  "public/icon-512-maskable.png",
]) {
  check(`${icon} exists`, statSync(path.join(root, icon)).size > 500, icon);
}

console.log("\n6. One page header, one card, one button");
const header = read("components/ui/page-header.tsx");
check("there is a shared page header", /export function PageHeader/.test(header));
const usingHeader = sources.filter((file) => /<PageHeader/.test(read(file)));
check("and the list pages use it", usingHeader.length >= 6, String(usingHeader.length));
check(
  "a status chip carries a dot",
  /dot\?: boolean/.test(read("components/ui/badge.tsx")) &&
    /dot\b/.test(read("components/projects/status-badge.tsx")),
);
check(
  "a working button does not dim as though it had failed",
  /loading && !disabled && "disabled:opacity-100"/.test(read("components/ui/button.tsx")),
);
check(
  "a destructive button is red, not gold",
  /danger: "bg-danger-strong text-white/.test(read("components/ui/button.tsx")),
);
check(
  "controls take their minimum from the touch token",
  /min-h-\(--ui-control-min\)/.test(read("components/ui/input.tsx")) &&
    /min-h-\(--ui-control-min\)/.test(read("components/ui/select.tsx")) &&
    /--ui-control-min: 3rem/.test(read("app/globals.css")),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL BRAND CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
