/**
 * Open Jobs: the grouping and the order, against the seed as of 26 Oct 2026.
 *
 * The groups are worked out from the dates and today's date, never stored,
 * so they are checked here with "today" pinned: the seed's thirteen jobs
 * must fall into FIXED, OVERDUE, THIS WEEK and LATER exactly as a person
 * reading the dates would put them, and in date order inside each group.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:open-jobs
 */

import { readFileSync } from "node:fs";

import {
  JOB_GROUP_ORDER,
  JOB_PO_BUCKET,
  addDays,
  dayLabel,
  googleMapsUrl,
  groupOf,
  parseFixed,
  sortJobs,
  splitStore,
  wazeUrl,
  whenLabel,
} from "../lib/jobs/jobs.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const TODAY = "2026-10-26";
const seed = JSON.parse(read("../supabase/seed/open-jobs-2026-10-26.json"));

/** The seed as the page would hold it. */
const jobs = seed.map((row) => {
  const { name, code } = splitStore(row.store);
  const fixed = parseFixed(row.fixed);
  return {
    store_name: name,
    store_code: code,
    fixed_date: fixed.date,
    fixed_time: fixed.time,
    fixed_note: fixed.note,
    target_date: row.target ?? null,
    po: row.po,
  };
});

console.log("\n1. The seed reads cleanly");
check("thirteen jobs", jobs.length === 13);
check("store and GB code come apart", jobs[0].store_name === "Shoreham" && jobs[0].store_code === "GB1443");
check("a store with no code keeps its name", splitStore("Bradley Stoke GB2279").code === "GB2279" && splitStore("Somewhere").code === null);
check("'2026-10-27 AM (time TBC)' is a date and a note", jobs[0].fixed_date === "2026-10-27" && jobs[0].fixed_time === null && jobs[0].fixed_note === "AM (time TBC)");
check("'2026-10-28 05:00' is a date and a time", jobs[1].fixed_date === "2026-10-28" && jobs[1].fixed_time === "05:00" && jobs[1].fixed_note === null);
check("no fixed date reads as none", parseFixed(undefined).date === null);

console.log("\n2. Grouped from the dates and today, never stored");
const groups = jobs.map((job) => groupOf(job, TODAY));
const by = (store, po) => groups[jobs.findIndex((j) => j.store_name === store && (po ? j.po.includes(po) : true))];
check("a fixed attendance is FIXED whatever its target date", by("Shoreham") === "fixed");
check("a target date that has passed is OVERDUE", by("Reading") === "overdue" && by("Dover", "624757738") === "overdue");
check("within seven days is THIS WEEK", by("Mitcham") === "this_week" && by("Finsbury Park") === "this_week" && by("Dover", "624757854") === "this_week");
check("further out is LATER", by("Basildon") === "later" && by("Bradley Stoke") === "later");
check("exactly seven days out is still this week", groupOf({ store_name: "x", fixed_date: null, fixed_time: null, target_date: addDays(TODAY, 7) }, TODAY) === "this_week");
check("eight days out is later", groupOf({ store_name: "x", fixed_date: null, fixed_time: null, target_date: addDays(TODAY, 8) }, TODAY) === "later");
check("today itself is this week, not overdue", groupOf({ store_name: "x", fixed_date: null, fixed_time: null, target_date: TODAY }, TODAY) === "this_week");
check("yesterday is overdue", groupOf({ store_name: "x", fixed_date: null, fixed_time: null, target_date: addDays(TODAY, -1) }, TODAY) === "overdue");
check("no date at all is later", groupOf({ store_name: "x", fixed_date: null, fixed_time: null, target_date: null }, TODAY) === "later");
check("a month on, the same job has moved group by itself", groupOf(jobs.find((j) => j.store_name === "Basildon"), "2026-11-26") === "overdue");
check("the month boundary is a plain calendar", addDays("2026-10-30", 7) === "2026-11-06");

console.log("\n3. The order on the page");
const ordered = sortJobs(jobs, TODAY).map((job) => `${job.store_name}${job.po[0] ? " " + job.po[0] : ""}`);
const expected = [
  "Shoreham 624679775",
  "Whitton",
  "Ramsgate 624656996",
  "Ramsgate 624657372",
  "Chelmsford 624656787",
  "Reading 624764465",
  "Dover 624757738",
  "Mitcham 624804765",
  "Dover 624757854",
  "Gravesend 624721346",
  "Finsbury Park 624802879",
  "Basildon 624801684",
  "Bradley Stoke 2002466002",
];
check("fixed first, in date and time order; then overdue; then this week; then later", JSON.stringify(ordered) === JSON.stringify(expected), JSON.stringify(ordered));
check("the same day at 05:00 comes before 22:00", ordered.indexOf("Whitton") < ordered.indexOf("Ramsgate 624656996"));
check("group order is the one on the spec", JSON.stringify(JOB_GROUP_ORDER) === JSON.stringify(["fixed", "overdue", "this_week", "later"]));

console.log("\n4. What the card says");
check("a fixed morning", whenLabel(jobs[0]) === "Tue 27 Oct · AM (time TBC)", whenLabel(jobs[0]));
check("a fixed clock time", whenLabel(jobs[1]) === "Wed 28 Oct · 05:00", whenLabel(jobs[1]));
check("a target", whenLabel(jobs[5]) === "Target Thu 22 Oct", whenLabel(jobs[5]));
check("no date", whenLabel({ fixed_date: null, fixed_time: null, fixed_note: null, target_date: null }) === "No date");
check("day labels", dayLabel("2026-11-15") === "Sun 15 Nov");

console.log("\n5. Waze and Google Maps open the store's own pin");
check("Waze", wazeUrl(50.83226, -0.2574) === "https://waze.com/ul?ll=50.83226,-0.2574&navigate=yes");
check("Google Maps", googleMapsUrl(51.35665, 1.39835) === "https://www.google.com/maps/dir/?api=1&destination=51.35665,1.39835");

console.log("\n6. Wired into the app, and the database shaped for the feed later");
{
  const migration = read("../supabase/migrations/20261026000014_jobs.sql");
  const page = read("../app/(app)/jobs/page.tsx");
  const card = read("../components/jobs/job-card.tsx");
  const actions = read("../app/(app)/jobs/actions.ts");
  const route = read("../app/(app)/jobs/[id]/po/[poId]/file/route.ts");
  check("jobs and their POs are tables, with RLS by company", /create table public\.jobs/.test(migration) && /create table public\.job_pos/.test(migration) && /foreach t in array array\['jobs', 'job_pos'\]/.test(migration) && /enable row level security/.test(migration));
  check("a PO keeps the portal's file id for the feed later", /po_file_id bigint/.test(migration));
  check("the PDFs live in a private bucket of their own", new RegExp(`'${JOB_PO_BUCKET}',\\s*'${JOB_PO_BUCKET}',\\s*false`).test(migration));
  check("with no update policy, like report PDFs", /job-pos_select/.test(migration) && /job-pos_insert/.test(migration) && /job-pos_delete/.test(migration) && !/job-pos_update/.test(migration));
  check("the page groups from today's working day", /workingDay\(\)/.test(page) && /sortJobs\(jobs, today\)/.test(page) && /groupOf\(job, today\)/.test(page));
  check("done jobs leave the main list", /\.eq\("status", showDone \? "done" : "open"\)/.test(page) && /Show done jobs/.test(page));
  check("the card has Waze, Google Maps and the PO PDF", /wazeUrl\(/.test(card) && /googleMapsUrl\(/.test(card) && /\/jobs\/\$\{job\.id\}\/po\/\$\{po\.id\}\/file/.test(card));
  check("a PDF is attached from the phone into the company's own folder", /\$\{companyId\}\/\$\{jobId\}\//.test(card) && /accept="application\/pdf,\.pdf"/.test(card));
  check("and the server refuses a path outside that folder", /storagePath\.startsWith\(`\$\{session\.companyId\}\/`\)/.test(actions));
  check("the PDF opens inline, to scan the QR on the screen", /content-disposition": `inline;/.test(route));
  check("Empire's colours, as tokens, not SiteBoss gold", /bg-empire-forest/.test(card) && /bg-empire-olive/.test(card) && /text-empire-sage/.test(card) && /--color-empire-forest: #152218/.test(read("../app/globals.css")));
  check("the phone reaches it from the dashboard", /href="\/jobs"/.test(read("../app/(app)/dashboard/page.tsx")));
  check("the photo uploader is untouched", !/job/.test(read("../components/reports/photo-upload.tsx")));
}

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL OPEN JOBS CHECKS PASSED");
else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
