/**
 * The site survey: what it is, what it must never say, and what it does not ask.
 *
 * A survey is a visit made before anybody has worked on a site. The single
 * rule everything here guards is that it must not imply work happened - so it
 * has no workforce, no plant, no deliveries and no "works completed", and it
 * cannot be built from source reports because there are none.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync } from "node:fs";

import {
  SUMMARY_DOCUMENT_TITLES,
  SUMMARY_KIND_LABELS,
  SUMMARY_SECTION_LABELS,
  SURVEY_SECTIONS,
  isSurvey,
  summaryPeriodFieldLabel,
  summaryPeriodLabel,
  summarySectionOrder,
  summarySectionsFor,
  summarySortOrder,
} from "../lib/summary-reports/sections.ts";
import { canFinaliseSummary } from "../lib/summary-reports/finalisation.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

console.log("\n1. A survey is its own kind of document");
check("it is recognised", isSurvey("survey"));
check("and the others are not", !isSurvey("progress") && !isSurvey("completion"));
check("it has a short name", SUMMARY_KIND_LABELS.survey === "Site Survey");
check(
  "and the title the issued PDF carries",
  SUMMARY_DOCUMENT_TITLES.survey === "Site Survey / Inspection Report",
  SUMMARY_DOCUMENT_TITLES.survey,
);
check(
  "the other two are unchanged",
  SUMMARY_DOCUMENT_TITLES.progress === "Progress Report" &&
    SUMMARY_DOCUMENT_TITLES.completion === "Completion Report",
);

console.log("\n2. It asks the questions somebody on site can answer");
const types = summarySectionOrder("survey");
check("purpose comes first", types[0] === "survey_purpose");
for (const expected of [
  "survey_purpose",
  "existing_condition",
  "measurements",
  "access_and_constraints",
  "proposed_works",
  "requirements",
  "pricing_notes",
]) {
  check(`it has ${expected}`, types.includes(expected));
}
check("seven sections, no more", types.length === 7);
check("every one has a label", types.every((type) => Boolean(SUMMARY_SECTION_LABELS[type])));
check("and a brief for the writer", SURVEY_SECTIONS.every((section) => section.brief.length > 40));
check("they sort in the order they are written", summarySortOrder("survey", "measurements") === 2);
check(
  "and a section from another kind is not claimed",
  summarySortOrder("survey", "works_completed") === 999,
);

console.log("\n3. It never asks what was completed, who was there, or what arrived");
const briefs = SURVEY_SECTIONS.map((section) => `${section.label} ${section.brief}`).join("\n").toLowerCase();
for (const forbidden of ["workforce", "operatives", "plant and equipment", "delivery", "deliveries"]) {
  check(`no section mentions ${forbidden}`, !briefs.includes(forbidden), forbidden);
}
check(
  "no section is called works completed",
  !summarySectionOrder("survey").includes("works_completed") &&
    !summarySectionOrder("survey").includes("completed_works"),
);
check(
  "recommended works are explicitly a recommendation",
  /recommend/i.test(SUMMARY_SECTION_LABELS.proposed_works) ||
    /proposed|recommend/i.test(
      SURVEY_SECTIONS.find((section) => section.type === "proposed_works").brief,
    ),
);
check(
  "and the brief forbids describing them as done",
  /never described as done|never.*instructed|never.*approved/i.test(
    SURVEY_SECTIONS.find((section) => section.type === "proposed_works").brief,
  ),
);
check(
  "requirements are a requirement, not a record of what was used",
  /never a record/i.test(
    SURVEY_SECTIONS.find((section) => section.type === "requirements").brief,
  ),
);
check(
  "the progress and completion sections are untouched",
  summarySectionsFor("progress").length === 7 && summarySectionsFor("completion").length === 9,
);

console.log("\n4. A visit is a day, not a period");
check(
  "it prints one date",
  summaryPeriodLabel("survey", "2026-08-29", "2026-08-29") === "2026-08-29",
);
check(
  "even though both columns carry it",
  !summaryPeriodLabel("survey", "2026-08-29", "2026-08-29").includes(" to "),
);
check("and it is labelled as a visit", summaryPeriodFieldLabel("survey") === "Date of visit");
check(
  "with no date it says so rather than inventing one",
  summaryPeriodLabel("survey", null, null) === "Date not recorded",
);
check(
  "a progress report still reads as a span",
  summaryPeriodLabel("progress", "2026-08-01", "2026-08-28") === "2026-08-01 to 2026-08-28",
);
check(
  "and a completion report with no period still says so",
  summaryPeriodLabel("completion", null, null) === "Whole project record",
);
check(
  // A progress report covers what was written or issued, not the whole job,
  // and no date is invented for one that was left blank.
  "a progress report with no period says so rather than claiming the project",
  summaryPeriodLabel("progress", null, null) === "Period not stated",
);
check("their labels are unchanged", summaryPeriodFieldLabel("progress") === "Reporting period");

console.log("\n5. A survey can be issued with nothing to consolidate");
check(
  "no source is needed",
  canFinaliseSummary({ status: "draft", kind: "survey", sourceCount: 0, sectionCount: 1 }).ok,
);
check(
  "but something has to be written",
  !canFinaliseSummary({ status: "draft", kind: "survey", sourceCount: 0, sectionCount: 0 }).ok,
);
check(
  // A Progress Report can now also be written directly, with no Daily Reports
  // behind it - see e2e/standalone-progress-smoke.mjs, which covers what stops
  // one claiming a provenance it does not have.
  "a progress report no longer needs sources either",
  canFinaliseSummary({ status: "draft", kind: "progress", sourceCount: 0, sectionCount: 3 }).ok,
);
check(
  "and neither does a completion report: a job can finish with nothing filed",
  canFinaliseSummary({ status: "draft", kind: "completion", sourceCount: 0, sectionCount: 3 }).ok,
);
check(
  "what every kind still needs is something written in it",
  !canFinaliseSummary({ status: "draft", kind: "survey", sourceCount: 0, sectionCount: 0 }).ok &&
    !canFinaliseSummary({ status: "draft", kind: "completion", sourceCount: 0, sectionCount: 0 }).ok,
);
check(
  "an issued survey is still immutable",
  !canFinaliseSummary({ status: "final", kind: "survey", sourceCount: 0, sectionCount: 3 }).ok,
);

console.log("\n6. An enquiry is not a live job");
const badge = read("../components/projects/status-badge.tsx");
check("the status is labelled for what it is", /survey: "Survey \/ enquiry"/.test(badge));
check("and told apart from active work", /export function isEnquiry/.test(badge));
check(
  "the dashboard's active projects stay active only",
  /\.eq\("status", "active"\)/.test(read("../app/(app)/dashboard/page.tsx")),
);
check(
  "a Daily Report cannot be started against an enquiry",
  /\.neq\("status", "survey"\)/.test(read("../app/(app)/reports/new/page.tsx")),
);
const projectActions = read("../app/(app)/projects/actions.ts");
check(
  "the project form accepts the new status",
  /z\.enum\(\["active", "survey", "on_hold", "completed"\]\)/.test(projectActions),
);
const surveyActions = read("../app/(app)/surveys/actions.ts");
check("an enquiry is created at survey status", /status: "survey"/.test(surveyActions));
check(
  "awarding the work makes it active",
  /update\(\{ status: "active" \}\)[\s\S]{0,120}\.eq\("status", "survey"\)/.test(surveyActions),
);
check(
  "and only an enquiry can be awarded",
  /That project is not an enquiry/.test(surveyActions),
);
check(
  "the store number is never copied into the project reference",
  !/project_reference/.test(surveyActions),
);
const projectPage = read("../app/(app)/projects/[id]/page.tsx");
check("an enquiry is not offered a Daily Report", /\{enquiry \? null : \(/.test(projectPage));
check("but is offered the survey", /\/surveys\/new\?project=/.test(projectPage));
check("and a way to award the work", /<AwardProject/.test(projectPage));

console.log("\n7. Where a survey can be started");
check(
  "from a store, before any project exists",
  /\/surveys\/new\?directory=/.test(read("../app/(app)/stores/[code]/page.tsx")),
);
check("from a project", /\/surveys\/new\?project=/.test(projectPage));
check("and from the reports list", /href="\/surveys\/new"/.test(read("../app/(app)/reports/page.tsx")));
check(
  "the consolidated flow refuses to start one by accident",
  /kind === "survey"[\s\S]{0,120}redirect\(/.test(read("../app/(app)/summary-reports/new/page.tsx")),
);
check(
  "several surveys can be run at one store",
  !/already has a survey|one survey per/i.test(surveyActions),
);

console.log("\n8. The issued document");
const pdf = read("../lib/pdf/summary-document.tsx");
check("takes its title from the kind", /SUMMARY_DOCUMENT_TITLES\[data\.kind\]/.test(pdf));
check("labels its date by the kind", /summaryPeriodFieldLabel\(data\.kind\)/.test(pdf));
check(
  "and prints no source record when there is none",
  /data\.sourceLabels\.length > 0 \? \(/.test(pdf),
);
check(
  "the survey opens as strongly as a completion report",
  /large=\{completion \|\| survey\}/.test(pdf),
);
for (const forbidden of ["Workforce", "Plant and equipment", "Deliveries"]) {
  check(`the consolidated PDF has no ${forbidden} section`, !pdf.includes(`>${forbidden}<`));
}

console.log("\n9. Photographs are taken inside the survey, on the system already there");
const photoActions = read("../app/(app)/summary-reports/photo-actions.ts");
const workspace = read("../components/summary-reports/report-photos.tsx");
const uploader = read("../components/reports/photo-upload.tsx");

check("there is no second photo table", !/create table|from\("survey_photos"\)/.test(photoActions));
check(
  "a photograph goes into the same photos table",
  /\.from\("photos"\)\s*\n\s*\.insert\(/.test(photoActions),
);
check(
  "and into the link the PDF already reads",
  /from\("summary_report_photos"\)\.insert\(/.test(photoActions.replace(/\s+/g, " ")),
);
check(
  "the storage path is checked against this company and project",
  /photoPathPrefix\(session\.companyId, report\.projectId\)/.test(photoActions),
);
check(
  "an issued report takes no more photographs",
  /status === "final"[\s\S]{0,80}SUMMARY_REPORT_IS_FINAL/.test(photoActions),
);
check(
  "a photograph is only ever added from its own project",
  /\.eq\("project_id", report\.projectId\)/.test(photoActions),
);
check(
  "removing takes the link and not the photograph",
  /\.from\("summary_report_photos"\)[\s\S]{0,60}\.delete\(\)/.test(photoActions) &&
    !/from\("photos"\)[\s\S]{0,40}\.delete\(\)/.test(photoActions),
);
check(
  "a new plate lands after the ones already there",
  /nextSortOrder/.test(photoActions),
);

check("the uploader is the application's own", /<PhotoUpload/.test(workspace));
check(
  "and it attaches straight to this report",
  /summaryReportId=\{reportId\}/.test(workspace),
);
check(
  "one uploader, two destinations, one code path",
  /summaryReportId\s*\?\s*await attachSummaryPhoto/.test(uploader.replace(/\n\s*/g, " ")),
);
check(
  "captions and AI descriptions are the ones used everywhere else",
  /<PhotoDetails/.test(workspace),
);
check(
  "the screen shows the plate references the PDF will print",
  /photoReference\(index\)/.test(workspace),
);
check(
  "project photographs can still be pulled in",
  /linkSummaryPhotos/.test(workspace),
);
check(
  // Decided by the page rather than baked into the workspace: the same
  // component serves a Progress Report written directly, and that has no
  // reason to mark its photographs at all.
  "a survey documents what is there now, so it starts on Before",
  /defaultCategory=\{survey \? "before" : undefined\}/.test(
    read("../app/(app)/summary-reports/[id]/page.tsx"),
  ),
);
check(
  "and everything else starts with no status",
  /defaultCategory = UNSET_PHOTO_STATUS/.test(workspace),
);

// The trap this design creates, and the guard against it: the curation form
// still exists on a survey for its issues, and it rewrites the photo links by
// deleting them first.
const curation = read("../components/summary-reports/summary-curation.tsx");
const summaryActions = read("../app/(app)/summary-reports/actions.ts");
check(
  "a survey's curation form carries no photograph fields",
  /showPhotos = true/.test(curation) && /\{showPhotos \? \(/.test(curation),
);
check(
  "it marks whether it carried a selection at all",
  /name="photosIncluded"/.test(curation),
);
const flatActions = summaryActions.replace(/\s+/g, " ");
check(
  "the action knows whether a selection was carried",
  /const photosIncluded = formData\.get\("photosIncluded"\) !== null/.test(summaryActions),
);
check(
  // The whole photograph reconciliation now lives inside this branch, so an
  // issue-only save reads nothing, deletes nothing and writes nothing about
  // photographs. It used to be one guarded delete; it is now the lot.
  "saving issues alone touches no photograph link at all",
  /if \(photosIncluded\) \{/.test(summaryActions) &&
    !/photoCaption_[\s\S]*?\}\s*const \{ error: issueDeleteError \}/.test(
      summaryActions.slice(0, summaryActions.indexOf("if (photosIncluded) {")),
    ),
);
check(
  "and reads no photograph fields either",
  /const requestedPhotos = photosIncluded \? formData\.getAll\("photoId"\)/.test(flatActions),
);
check(
  // `direct` is a survey or a Progress Report written directly: both work
  // their photographs in place, because neither has an earlier report that
  // collected them.
  "the survey page shows the workspace and hides the picker",
  /const direct = survey \|\| standalone/.test(read("../app/(app)/summary-reports/[id]/page.tsx")) &&
    // The curation form a survey gets carries issues alone. Asserted by what
    // it is passed rather than by one expression, because the form now sits in
    // whichever of the report's three sections its contents belong to.
    /<SummaryCuration[^>]*showPhotos=\{false\}/.test(read("../app/(app)/summary-reports/[id]/page.tsx")) &&
    /<ReportPhotos/.test(read("../app/(app)/summary-reports/[id]/page.tsx")),
);

console.log("\n10. Everything else about a survey is the systems already there");
const detail = read("../app/(app)/summary-reports/[id]/page.tsx");
check("photographs and issues are curated the same way", /<SummaryCuration/.test(detail));
check("documents are the same documents", /Supporting documents/.test(detail));
check("finalising is the same finalise", /<SummaryFinalise/.test(detail));
check("the source list is hidden when empty", /sourceItems\.length > 0/.test(detail));
check(
  "the AI reads the surveyor's own notes rather than nothing",
  /SURVEY NOTES RECORDED ON SITE/.test(read("../app/(app)/summary-reports/ai-actions.ts")),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL SITE SURVEY CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
