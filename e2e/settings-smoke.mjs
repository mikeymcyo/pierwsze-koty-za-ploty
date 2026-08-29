/**
 * Settings: what a device may choose, and what it must not be able to change.
 *
 * The rules are pure and tested directly. The rest guards the two things that
 * would matter if they broke: the defaults are still the application as it was,
 * and nothing on this screen can reach an issued PDF.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync } from "node:fs";

import {
  DEFAULT_PREFERENCES,
  PREFERENCE_STORAGE_KEY,
  TEXT_LABELS,
  TEXT_SIZES,
  THEMES,
  THEME_LABELS,
  TOUCH_LABELS,
  TOUCH_SIZES,
  parsePreferences,
  preferenceAttributes,
  preferenceBootScript,
  serialisePreferences,
} from "../lib/preferences.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

console.log("\n1. Only the settings that were asked for");
check("three appearances", THEMES.length === 3 && THEMES.join() === "dark,light,system");
check("three text sizes", TEXT_SIZES.join() === "small,medium,large");
check("two touch sizes", TOUCH_SIZES.join() === "standard,large");
check(
  "each is labelled",
  THEMES.every((t) => THEME_LABELS[t]) &&
    TEXT_SIZES.every((t) => TEXT_LABELS[t]) &&
    TOUCH_SIZES.every((t) => TOUCH_LABELS[t]),
);
const settings = read("../app/(app)/profile/page.tsx");
check("the page is Settings", /title="Settings"/.test(settings));
check(
  "it carries the account summary",
  /label="Email"/.test(settings) && /label="Company"/.test(settings),
);
check("and sign out", /signOut/.test(settings));
check("and what build this is", /APP_VERSION/.test(settings) && /shortBuildRef/.test(settings));
check("and nothing else was invented", !/notification|language|units|timezone/i.test(settings));

console.log("\n2. The application's defaults are unchanged");
check("dark", DEFAULT_PREFERENCES.theme === "dark");
check("normal type", DEFAULT_PREFERENCES.text === "medium");
check("normal targets", DEFAULT_PREFERENCES.touch === "standard");
check(
  "nothing stored means the defaults",
  JSON.stringify(parsePreferences(null)) === JSON.stringify(DEFAULT_PREFERENCES),
);
check(
  "and so does an empty string",
  JSON.stringify(parsePreferences("")) === JSON.stringify(DEFAULT_PREFERENCES),
);

console.log("\n3. Whatever is in storage, the app still has styles");
check(
  "nonsense falls back",
  JSON.stringify(parsePreferences("{{{")) === JSON.stringify(DEFAULT_PREFERENCES),
);
check(
  "a bare value falls back",
  JSON.stringify(parsePreferences('"dark"')) === JSON.stringify(DEFAULT_PREFERENCES),
);
check(
  "null falls back",
  JSON.stringify(parsePreferences("null")) === JSON.stringify(DEFAULT_PREFERENCES),
);
check("an unknown theme falls back", parsePreferences('{"theme":"neon"}').theme === "dark");
check("an unknown text size falls back", parsePreferences('{"text":"huge"}').text === "medium");
check("a number falls back", parsePreferences('{"touch":3}').touch === "standard");
check(
  "and a valid choice survives",
  JSON.stringify(parsePreferences('{"theme":"light","text":"large","touch":"large"}')) ===
    JSON.stringify({ theme: "light", text: "large", touch: "large" }),
);
const round = { theme: "system", text: "small", touch: "large" };
check(
  "what is written is what is read back",
  JSON.stringify(parsePreferences(serialisePreferences(round))) === JSON.stringify(round),
);

console.log("\n4. Applied before anything is drawn");
const boot = preferenceBootScript();
check("the script reads this device's storage", boot.includes(PREFERENCE_STORAGE_KEY));
check(
  "it stamps all three attributes",
  ["data-theme", "data-text", "data-touch"].every((a) => boot.includes(a)),
);
check(
  "it falls back to the defaults, not to nothing",
  /"dark"/.test(boot) && /"medium"/.test(boot) && /"standard"/.test(boot),
);
check("a device with storage off does not throw", /catch/.test(boot));
check("it is self-contained and runs itself", boot.trim().endsWith("})();"));
const layout = read("../app/layout.tsx");
check("and it runs in the head", /<head>[\s\S]{0,400}preferenceBootScript\(\)/.test(layout));
check(
  "the root is allowed to differ from the server on first render",
  /suppressHydrationWarning/.test(layout),
);
check(
  "the settings screen and the script agree on the attributes",
  /preferenceAttributes/.test(read("../components/settings/appearance-settings.tsx")),
);
check(
  "the attributes are what the stylesheet keys off",
  JSON.stringify(preferenceAttributes({ theme: "light", text: "large", touch: "large" })) ===
    JSON.stringify({ "data-theme": "light", "data-text": "large", "data-touch": "large" }),
);

console.log("\n5. Scaling is a token, not a page hack");
const css = read("../app/globals.css");
check("text scales at the root", /font-size:\s*calc\(16px \* var\(--ui-text-scale\)\)/.test(css));
check(
  "small and large set it",
  /\[data-text="small"\][\s\S]{0,80}--ui-text-scale/.test(css) &&
    /\[data-text="large"\][\s\S]{0,80}--ui-text-scale/.test(css),
);
check(
  "touch sets a control minimum",
  /\[data-touch="large"\][\s\S]{0,160}--ui-control-min/.test(css),
);
check(
  "and the shared controls draw from it",
  /min-h-\(--ui-control-min\)/.test(read("../components/ui/button.tsx")) &&
    /min-h-\(--ui-control-min\)/.test(read("../components/ui/input.tsx")) &&
    /min-h-\(--ui-control-min\)/.test(read("../components/ui/select.tsx")),
);
check("a field never drops below the size iOS zooms at", /font-size:\s*max\(16px, 1rem\)/.test(css));
check("light is a palette swap, not a second stylesheet", /:root\[data-theme="light"\]/.test(css));
check(
  "system follows the device",
  /prefers-color-scheme: dark[\s\S]{0,80}\[data-theme="system"\]/.test(css),
);
check(
  "the browser draws its furniture to match",
  /html\[data-theme="light"\][\s\S]{0,60}color-scheme: light/.test(css),
);

console.log("\n6. The brand is the brand in both");
check("gold is the same value in light", (css.match(/#ffc107/g) ?? []).length >= 1);
check(
  "gold as text darkens where it must be read on white",
  /--color-brand-ink: #a86a00/.test(css) && /--color-brand-ink: #ffc107/.test(css),
);
check(
  "and the wordmark uses it rather than the fill",
  /text-brand-ink/.test(read("../components/brand/wordmark.tsx")),
);
check(
  "the mark itself is fixed, so it is the same object either way",
  /fill="#0d0f12"/.test(read("../components/brand/monogram.tsx")),
);

console.log("\n7. None of it reaches an issued PDF");
const pdfTheme = read("../lib/pdf/theme.ts");
check("the PDF has its own palette", /createPdfStyles/.test(pdfTheme));
check("which is not the screen's", !/var\(--/.test(pdfTheme));
check("nor this device's", !/ui-text-scale|ui-control-min|data-theme/.test(pdfTheme));
check(
  "and no preference is imported anywhere near the renderer",
  !/preferences/.test(pdfTheme) &&
    !/preferences/.test(read("../lib/pdf/summary-document.tsx")) &&
    !/preferences/.test(read("../lib/pdf/report-document.tsx")),
);
check("PDF sizes are still fixed points", /fontSize: 9\.5/.test(pdfTheme));

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL SETTINGS CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
