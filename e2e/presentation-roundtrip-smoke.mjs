/**
 * Two defects found reading Production at 4697a1f.
 *
 * 1. The keyboard's Go key started an AI rewrite. The report form has two
 *    submit buttons, and the first in DOM order was "Write my report", so
 *    Enter in Weather or a workforce field pressed it. A hidden default
 *    submit button now comes first and carries no formAction, so Go saves.
 *
 * 2. Preview forgot the PDF presentation. Style, layout, cover and the
 *    documents toggle lived in state; coming back from the viewer remounted
 *    the card with the defaults, and Finalise issued those. The choices now
 *    ride in the report page's own URL - written as they are made, carried
 *    back by the viewer's Close - so Close and Back both restore them.
 *
 * The round trip is pure and run here; the wiring is read from source. The
 * real Enter key and the real Back gesture are driven in
 * e2e/presentation-browser-smoke.mjs against a deployment.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:presentation-roundtrip
 */

import { readFileSync } from "node:fs";

import {
  DEFAULT_PRESENTATION,
  applyPresentationToUrl,
  presentationFromSearch,
  presentationQuery,
} from "../lib/pdf/presentation-query.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. Choices survive the round trip through a URL");
{
  const chosen = { style: "photo", layout: "focus", cover: "6d87ce67-1a65-4e31-aeed-262ae89189a8", includeDocuments: false };
  const query = presentationQuery(chosen);
  check("every departure from the default is written", query === "?style=photo&layout=focus&cover=6d87ce67-1a65-4e31-aeed-262ae89189a8&documents=0", query);
  const back = presentationFromSearch(Object.fromEntries(new URLSearchParams(query)));
  check("and read back exactly", JSON.stringify(back) === JSON.stringify(chosen), JSON.stringify(back));
  check("the defaults write nothing at all", presentationQuery(DEFAULT_PRESENTATION) === "", presentationQuery(DEFAULT_PRESENTATION));
  check("and nothing reads back as the defaults", JSON.stringify(presentationFromSearch({})) === JSON.stringify(DEFAULT_PRESENTATION));
  const partial = presentationFromSearch({ style: "corporate" });
  check("one choice leaves the others at their defaults", partial.style === "corporate" && partial.layout === "standard" && partial.cover === null && partial.includeDocuments === true);
}

console.log("\n2. A bad URL falls back, never fails");
{
  const bad = presentationFromSearch({ style: "neon", layout: "../etc", cover: "   ", documents: "maybe" });
  check("an unknown style is the house style", bad.style === "siteboss");
  check("an unknown layout is standard", bad.layout === "standard");
  check("a blank cover is no cover", bad.cover === null);
  check("documents are in unless the URL says 0", bad.includeDocuments === true);
  check("'none' is no cover", presentationFromSearch({ cover: "none" }).cover === null);
  const repeated = presentationFromSearch({ style: ["photo", "corporate"] });
  check("a repeated key takes the first value", repeated.style === "photo");
  // A cover id from elsewhere is only ever an id here; whether it is one of
  // this report's photographs is decided by pickCoverPhoto, which yields no
  // cover for any id that is not.
  const presentation = read("../lib/pdf/presentation.ts");
  check("a foreign cover id produces no cover, by the existing rule", /photos\.find\(\(photo\) => photo\.id === coverPhotoId\) \?\? null/.test(presentation));
}

console.log("\n3. The page's own address is updated in place, nothing else touched");
{
  const url = new URL("https://app.sitebosspro.co.uk/reports/abc?saved=1&resolve=xyz");
  applyPresentationToUrl(url, { style: "corporate", layout: "focus", cover: null, includeDocuments: false });
  check("the choices are on the address", url.searchParams.get("style") === "corporate" && url.searchParams.get("layout") === "focus" && url.searchParams.get("documents") === "0");
  check("and what was there stays", url.searchParams.get("saved") === "1" && url.searchParams.get("resolve") === "xyz");
  applyPresentationToUrl(url, DEFAULT_PRESENTATION);
  check("choosing the defaults again clears their keys", !url.searchParams.has("style") && !url.searchParams.has("layout") && !url.searchParams.has("cover") && !url.searchParams.has("documents"));
  check("without touching the rest", url.search === "?saved=1&resolve=xyz", url.search);
}

console.log("\n4. Wired into both finalise cards, both pages and both viewers");
{
  const daily = read("../components/reports/finalise-report.tsx");
  const summary = read("../components/summary-reports/summary-finalise.tsx");
  for (const [name, card] of [["daily", daily], ["consolidated", summary]]) {
    check(`the ${name} card starts from what the page was opened with`, /useState<PdfStyle>\(initial\.style \?\? DEFAULT_PDF_STYLE\)/.test(card) && /useState<PhotoLayout>\(initial\.layout \?\? DEFAULT_PHOTO_LAYOUT\)/.test(card) && /useState<string \| null>\(initial\.cover\)/.test(card) && /useState\(initial\.includeDocuments\)/.test(card));
    check(`and keeps the address current as choices change, without navigating`, /window\.history\.replaceState\(null, "", url\)/.test(card) && /applyPresentationToUrl\(new URL\(window\.location\.href\)/.test(card));
    check(`only when the address would actually change`, /if \(url\.href !== window\.location\.href\)/.test(card));
    check(`the ${name} finalise still posts exactly the card's choices`, /name="pdfStyle" value=\{style\}/.test(card) && /name="photoLayout" value=\{layout\}/.test(card) && /name="coverPhoto" value=\{cover \?\? ""\}/.test(card) && /name="includeDocuments" value=\{documentsFlag\(includeDocuments\)\}/.test(card));
    check(`the ${name} preview link is unchanged`, /\$\{presentation\}/.test(card) && /draft=1&documents=\$\{documentsFlag\(/.test(card));
  }
  const dailyPage = read("../app/(app)/reports/[id]/page.tsx");
  const summaryPage = read("../app/(app)/summary-reports/[id]/page.tsx");
  check("the Daily page reads the choices from its URL and hands them over", /presentationFromSearch\(search\)/.test(dailyPage) && /initial=\{presentation\}/.test(dailyPage));
  check("so does the consolidated page", /presentationFromSearch\(search\)/.test(summaryPage) && /initial=\{presentation\}/.test(summaryPage));
  check("the Daily page still reads ?saved and ?resolve", /const \{ saved, resolve \} = search;/.test(dailyPage));
  const dailyPdf = read("../app/(app)/reports/[id]/pdf/page.tsx");
  const summaryPdf = read("../app/(app)/summary-reports/[id]/pdf/page.tsx");
  check("the Daily viewer's Close carries the choices back on a draft preview only", /backHref=\{`\/reports\/\$\{id\}\$\{wantsDraft \? presentationQuery\(presentationFromSearch\(search\)\) : ""\}`\}/.test(dailyPdf));
  check("so does the consolidated viewer's", /backHref=\{`\/summary-reports\/\$\{id\}\$\{wantsDraft \? presentationQuery\(presentationFromSearch\(search\)\) : ""\}`\}/.test(summaryPdf));
  check("the render itself is untouched: the viewers still build the same preview query", /previewQuery = `\$\{documentsFlag\}style=\$\{pdfStyleOf\(search\.style\)\}&layout=\$\{photoLayoutOf\(search\.layout\)\}/.test(dailyPdf) && /previewQuery = `\$\{documentsFlag\}style=\$\{pdfStyleOf\(search\.style\)\}&layout=\$\{photoLayoutOf\(search\.layout\)\}/.test(summaryPdf));
  check("the finalise actions are untouched", !/presentation-query/.test(read("../app/(app)/reports/finalise-actions.ts")) && !/presentation-query/.test(read("../app/(app)/summary-reports/finalise-actions.ts")));
}

console.log("\n5. The keyboard's Go key saves the draft; only the button writes");
{
  const form = read("../components/reports/report-capture-form.tsx");
  const formStart = form.indexOf('<form action={formAction} className="contents">');
  const body = form.slice(formStart);
  const firstSubmit = body.search(/<button type="submit" hidden tabIndex=\{-1\} aria-hidden data-default-submit \/>/);
  const writeButton = body.indexOf("<WriteButton");
  const saveButton = body.indexOf("<SaveButton");
  check("a hidden default submit is the first submit button in the form", firstSubmit > 0 && firstSubmit < writeButton && firstSubmit < saveButton);
  const defaultTag = body.match(/<button[^>]*data-default-submit[^>]*>/)?.[0] ?? "";
  check("it carries no formAction, so it performs the form's own action - save", defaultTag.length > 0 && !/formAction/.test(defaultTag), defaultTag);
  check("it is hidden, not disabled - a disabled default button blocks Enter altogether", /\bhidden\b/.test(defaultTag) && !/disabled/.test(defaultTag));
  check("Write my report is still the only button with its own action", (form.match(/formAction=\{action\}/g) ?? []).length === 1 && /function WriteButton/.test(form));
  check("and Save draft is still there", /Save draft/.test(form) && /function SaveButton/.test(form));
  check("the notes guard against writing over captures added elsewhere is untouched", /name="raw_notes_base" value=\{report\.raw_notes \?\? ""\}/.test(form));
}

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PRESENTATION ROUNDTRIP CHECKS PASSED");
else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
