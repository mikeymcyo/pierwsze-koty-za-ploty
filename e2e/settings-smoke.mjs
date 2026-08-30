/**
 * Settings: what a device may choose, and what it must not be able to change.
 *
 * The rules are pure and tested directly. The rest guards the two things that
 * would matter if they broke: the defaults are still the application as it was,
 * and nothing on this screen can reach an issued PDF.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync, readdirSync } from "node:fs";

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
import {
  NAV_ITEMS,
  SETTINGS_HREF,
  safeReturnPath,
  settingsHref,
  settingsReturn,
} from "../lib/navigation.ts";
import {
  COMPANY_NAME_MAX,
  COMPANY_OWNER_ONLY,
  COMPANY_RENAME_NOTE,
  canEditCompanyDetails,
  companyNameProblem,
} from "../lib/company/details.ts";

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
  // The company moved out of the read-only account rows and into its own
  // editable section when renaming landed; it is still on this screen.
  "it carries the account summary",
  /label="Email"/.test(settings) && /<CompanyDetails/.test(settings),
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

console.log("\n8. Settings can always be left, without the browser's Back");
check("the gear carries where it was tapped", settingsHref("/reports") === "/profile?from=%2Freports");
check(
  "and a report screen, not just a section",
  settingsHref("/summary-reports/abc") === "/profile?from=%2Fsummary-reports%2Fabc",
);
check("Settings does not carry itself", settingsHref(SETTINGS_HREF) === SETTINGS_HREF);
check(
  "the way back is named for the section it returns to",
  settingsReturn("/reports/abc").label === "Back to Reports" &&
    settingsReturn("/reports/abc").href === "/reports/abc",
);
check(
  "projects and stores are named too",
  settingsReturn("/projects/1").label === "Back to Projects" &&
    settingsReturn("/stores/1470").label === "Back to Stores",
);
check(
  "a screen outside the nav still gets a control",
  settingsReturn("/surveys/new").label === "Back" &&
    settingsReturn("/surveys/new").href === "/surveys/new",
);
check(
  "and arriving with nothing is never a dead end",
  settingsReturn(undefined).href === "/dashboard" &&
    settingsReturn(null).href === "/dashboard" &&
    settingsReturn("").href === "/dashboard" &&
    settingsReturn(SETTINGS_HREF).href === "/dashboard",
);
check(
  // Create is a raised action, not a place, so it is never named as one - the
  // control still returns to the screen, just without borrowing its label.
  "the Create button never becomes the way back",
  NAV_ITEMS.some((item) => item.primary) &&
    settingsReturn("/reports/new").label === "Back" &&
    settingsReturn("/reports/new").href === "/reports/new",
);

console.log("\n9. The way back cannot leave the application");
for (const hostile of [
  "https://example.com/steal",
  "//example.com/steal",
  "http://example.com",
  "javascript:alert(1)",
  "\\\\example.com",
  "/reports\\..\\..",
  "reports",
]) {
  check(`refused: ${hostile}`, safeReturnPath(hostile) === null);
}
check("an ordinary path survives", safeReturnPath("/projects/abc?tab=reports") === "/projects/abc?tab=reports");
check(
  "and a refused one falls back rather than being patched up",
  settingsReturn("https://example.com").href === "/dashboard",
);

console.log("\n10. The company name is the company's, and only the owner's to change");
check("an owner may", canEditCompanyDetails("owner"));
check("a member may not", !canEditCompanyDetails("member"));
check("and is told who can", COMPANY_OWNER_ONLY.includes("owner"));
check("an empty name is refused", companyNameProblem("   ") !== null);
check("a one-character name is refused", companyNameProblem("A") !== null);
check("a real one is not", companyNameProblem("  Empire Interiors Ltd  ") === null);
check(
  "a name that would not fit a PDF header is refused",
  companyNameProblem("x".repeat(COMPANY_NAME_MAX + 1)) !== null &&
    companyNameProblem("x".repeat(COMPANY_NAME_MAX)) === null,
);
check(
  "trades' punctuation is not policed",
  ["J & B Groundworks", "O'Connor Build", "Müller Bau GmbH", "A.C.E. (UK)"].every(
    (name) => companyNameProblem(name) === null,
  ),
);
check(
  "the screen says what a rename does and does not touch",
  /already issued/i.test(COMPANY_RENAME_NOTE) && /not rewritten/i.test(COMPANY_RENAME_NOTE),
);

console.log("\n11. Renaming reaches new documents and no stored one");
const companyAction = read("../app/(app)/profile/actions.ts");
check("the action only ever writes the companies row", /from\("companies"\)/.test(companyAction));
check(
  "it never opens the PDF bucket",
  !/\.storage\b|PDF_BUCKET|pdf_path|report-pdfs/.test(companyAction),
);
check(
  "and never touches a report",
  !/from\("reports"\)|from\("summary_reports"\)/.test(companyAction),
);
check(
  "ownership is checked before the write as well as by RLS",
  /canEditCompanyDetails/.test(companyAction),
);
check(
  "the policy that decides is still owner-only",
  /companies_update_owners[\s\S]{0,200}is_company_owner/.test(
    read("../supabase/migrations/20260826000002_rls_policies.sql"),
  ),
);
check(
  "no migration was needed for any of it",
  !readdirSync(new URL("../supabase/migrations", import.meta.url)).some((file) =>
    /company_details|settings|rename/i.test(file),
  ),
);
check(
  "every renderer still reads the name live, so the next PDF carries it",
  [
    "../app/(app)/reports/finalise-actions.ts",
    "../app/(app)/reports/[id]/preview/route.ts",
    "../app/(app)/summary-reports/finalise-actions.ts",
    "../app/(app)/summary-reports/[id]/preview/route.ts",
  ].every((file) => /companyName: session\.companyName|companyName: identity\.companyName|session\.companyName/.test(read(file))),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL SETTINGS CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
