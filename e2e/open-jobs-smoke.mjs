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
import { createClient } from "@supabase/supabase-js";
import { listJobs } from "../lib/jobs/list-jobs.ts";

import {
  JOB_GROUP_ORDER,
  JOB_PO_BUCKET,
  addDays,
  dayLabel,
  filterJobs,
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
    pos: row.po.map((po_number) => ({ po_number })),
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
  const attachment = read("../lib/jobs/attach-po.ts");
  const route = read("../app/(app)/jobs/[id]/po/[poId]/file/route.ts");
  check("jobs and their POs are tables, with RLS by company", /create table public\.jobs/.test(migration) && /create table public\.job_pos/.test(migration) && /foreach t in array array\['jobs', 'job_pos'\]/.test(migration) && /enable row level security/.test(migration));
  check("a PO keeps the portal's file id for the feed later", /po_file_id bigint/.test(migration));
  check("the PDFs live in a private bucket of their own", new RegExp(`'${JOB_PO_BUCKET}',\\s*'${JOB_PO_BUCKET}',\\s*false`).test(migration));
  check("with no update policy, like report PDFs", /job-pos_select/.test(migration) && /job-pos_insert/.test(migration) && /job-pos_delete/.test(migration) && !/job-pos_update/.test(migration));
  check("the page groups from today's working day", /workingDay\(\)/.test(page) && /sortJobs\(jobs, today\)/.test(page) && /groupOf\(job, today\)/.test(page));
  check("the page passes the active company and status to the list", /listJobs\(supabase, session.companyId, showDone \? "done" : "open"\)/.test(page));
  check("a failed list read is shown as an error", /<LoadError what="your jobs" code=\{error.code\}/.test(page));
  check("the card has Waze, Google Maps and the PO PDF", /wazeUrl\(/.test(card) && /googleMapsUrl\(/.test(card) && /\/jobs\/\$\{job\.id\}\/po\/\$\{po\.id\}\/file/.test(card));
  check("a PDF is attached from the phone into the company's own folder", /\$\{companyId\}\/\$\{jobId\}\//.test(card) && /accept="application\/pdf,\.pdf"/.test(card));
  check("and the server binds the upload to its company, job and PO", /\$\{companyId\}\/\$\{existing\.job_id\}/.test(attachment) && /\$\{folder\}\/\$\{poId\}-/.test(attachment));
  check("the PDF opens inline, to scan the QR on the screen", /content-disposition": `inline;/.test(route));
  check("a replaced PDF is fetched again instead of served stale", /"cache-control": "private, no-store"/.test(route));
  check("Empire's colours, as tokens, not SiteBoss gold", /bg-empire-forest/.test(card) && /bg-empire-olive/.test(card) && /text-empire-sage/.test(card) && /--color-empire-forest: #152218/.test(read("../app/globals.css")));
  check("the phone reaches it from the dashboard", /href="\/jobs"/.test(read("../app/(app)/dashboard/page.tsx")));
  check("the photo uploader is untouched", !/job/.test(read("../components/reports/photo-upload.tsx")));
}

console.log("\n7. Find a job from its store or any purchase order");
const sorted = sortJobs(jobs, TODAY);
check("blank search keeps the entire list in urgency order", filterJobs(sorted, "  ") === sorted);
check("a case-insensitive store code returns both Dover jobs in urgency order",
  filterJobs(sorted, "  gb1650 ").map((job) => job.po[0]).join(",") === "624757738,624757854");
check("a store and part of its fifth PO select the correct Dover job",
  filterJobs(sorted, "doVer   PO 57770").map((job) => job.po[0]).join(",") === "624757854");
check("a store without any purchase orders can still be found", filterJobs(sorted, "whit")[0]?.store_name === "Whitton");
check("a job without a store code is still searchable", filterJobs([{ store_name: "New site", store_code: null, pos: [] }], "new site").length === 1);
check("unmatched terms return no results", filterJobs(sorted, "shoreham 57770").length === 0);

console.log("\n8. Read jobs and POs across the API row limit");
{
  const id = (n) => String(n).padStart(5, "0");
  const open = Array.from({ length: 1001 }, (_, i) => ({
    id: id(i + 2), status: "open", company_id: "empire", store_name: `Store ${i}`, store_code: null,
  }));
  const archive = { id: id(0), status: "done", company_id: "empire", store_name: "Archive", store_code: null };
  const outsider = { id: id(1), status: "open", company_id: "other", store_name: "Other company", store_code: null };
  const jobRows = [archive, outsider, ...open];
  const makePo = (job, n) => ({
    id: id(n), job_id: job.id, company_id: job.company_id, po_number: `PO-${id(n)}`,
    po_file_id: n, storage_path: `${job.company_id}/${job.id}/${n}.pdf`,
    created_at: new Date(n * 1000).toISOString(),
  });
  const last = open.at(-1);
  const poRows = [
    ...Array.from({ length: 1001 }, (_, i) => makePo(archive, i)),
    makePo(outsider, 1001),
    ...Array.from({ length: 1001 }, (_, i) => makePo(last, 1002 + i)),
  ];
  // This PO was issued first despite sorting last by ID.
  const target = poRows.at(-1);
  target.created_at = "1970-01-01T00:00:00.000Z";
  const jobById = new Map(jobRows.map((job) => [job.id, job]));
  let failLaterPoPage = false;
  let readCount = 0;
  const client = createClient("http://fixtures.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const { pathname, searchParams } = new URL(input);
      const isPo = pathname.endsWith("/job_pos");
      const rows = isPo ? poRows : jobRows;
      const company = searchParams.get("company_id");
      const status = searchParams.get(isPo ? "jobs.status" : "status");
      const after = searchParams.get("id")?.slice(3);
      if (++readCount > 30) throw new Error("Pagination repeated a page");
      if (company !== "eq.empire" || !["eq.open", "eq.done"].includes(status)) throw new Error("Unscoped read");
      if (isPo && !["po_number", "po_file_id", "storage_path"].every((field) => searchParams.get("select")?.split(",").includes(field))) throw new Error("Missing PO details");
      if (isPo && !searchParams.get("select")?.includes("jobs!inner(")) throw new Error("Missing jobs inner join");
      if (searchParams.get("order") !== "id.asc") throw new Error("Missing stable ID order");
      if (isPo && after && failLaterPoPage) return Response.json({ code: "fixture_failure", message: "Second page failed" }, { status: 400 });
      const matches = rows.filter((row) =>
        company === `eq.${row.company_id}` &&
        status === `eq.${isPo ? jobById.get(row.job_id).status : row.status}` &&
        (!after || row.id > after));
      return Response.json(matches.slice(0, Math.min(Number(searchParams.get("limit") ?? 1000), 1000)));
    } },
  });
  const result = await listJobs(client, "empire", "open");
  check("all 1,001 open jobs are read in the current company", !result.error && result.jobs.length === 1001 && !result.jobs.some((job) => job.id === outsider.id || job.id === archive.id));
  const [found] = filterJobs(result.jobs, target.po_number);
  check("an open PO beyond the first 1,000 is searchable after 1,001 archived POs", found?.id === last.id && found.pos.length === 1001);
  check("the attachment keeps its ID and private path, and creation order survives pagination",
    found?.pos[0]?.id === target.id && found.pos[0].storage_path === target.storage_path && found.pos[0].po_file_id === target.po_file_id);
  check("an open job with no PO is retained", result.jobs.find((job) => job.id === open[0].id)?.pos.length === 0);
  const done = await listJobs(client, "empire", "done");
  check("done reads only archived jobs and all their purchase orders", !done.error && done.jobs.length === 1 && done.jobs[0].id === archive.id && done.jobs[0].pos.length === 1001);
  failLaterPoPage = true;
  const failed = await listJobs(client, "empire", "open");
  check("a later PO page failure returns an error without partial cards", failed.error?.code === "fixture_failure" && !failed.jobs.length);
}

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL OPEN JOBS CHECKS PASSED");
else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
