import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { JobCard, type JobCardData } from "@/components/jobs/job-card";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { JOB_GROUP_LABELS, JOB_GROUP_ORDER, groupOf, sortJobs, type JobGroup } from "@/lib/jobs/jobs";
import { workingDay } from "@/lib/reports/working-day";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Open Jobs" };

/**
 * Open Jobs: every purchase order the crew is attending, one card each.
 *
 * Grouped by what matters on the road - a fixed attendance first, then what
 * is already late, then this week, then the rest - and the groups are worked
 * out from the dates and today's date each time the page is drawn, never
 * stored. Done jobs leave the list and can be shown again with one tap.
 *
 * Empire Interiors' own colours here, not SiteBoss gold: this is Mike's hub
 * for Empire's Lidl work, and it should read as Empire's.
 */
export default async function OpenJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const { done } = await searchParams;
  const showDone = done === "1";
  const session = await requireSessionContext();
  const supabase = await createClient();

  // Two reads rather than one embedded select: the jobs, then every PO of
  // the company's jobs. RLS scopes both to the caller's company.
  const [{ data, error }, { data: poRows }] = await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("jobs")
        .select("id, store_name, store_code, fixed_date, fixed_time, fixed_note, target_date, work, crew, address, lat, lng, notes, status")
        .eq("status", showDone ? "done" : "open"),
    ),
    withClockSkewRetry(() =>
      supabase.from("job_pos").select("id, job_id, po_number, po_file_id, storage_path").order("created_at", { ascending: true }),
    ),
  ]);

  const today = workingDay();
  const jobs: JobCardData[] = (data ?? []).map((row) => ({
    ...row,
    pos: (poRows ?? [])
      .filter((po) => po.job_id === row.id)
      .map(({ id, po_number, po_file_id, storage_path }) => ({ id, po_number, po_file_id, storage_path })),
  }));
  const ordered = sortJobs(jobs, today);

  const grouped = JOB_GROUP_ORDER.map((group) => ({
    group,
    jobs: ordered.filter((job) => groupOf(job, today) === group),
  })).filter((entry) => entry.jobs.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <header className="-mx-4 -mt-5 bg-empire-forest px-4 pt-6 pb-5 text-empire-sage md:mx-0 md:mt-0 md:rounded-card md:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-empire-olive text-white">
            <ClipboardList aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-bold tracking-tight text-white md:text-3xl">
              {showDone ? "Done jobs" : "Open Jobs"}
            </h1>
            <p className="text-sm">Empire Interiors · Lidl purchase orders</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span>
            {ordered.length} {ordered.length === 1 ? "job" : "jobs"}
            {showDone ? " done" : " open"}
          </span>
          <Link href={showDone ? "/jobs" : "/jobs?done=1"} className="font-semibold text-white underline underline-offset-4">
            {showDone ? "Show open jobs" : "Show done jobs"}
          </Link>
        </div>
      </header>

      {error ? (
        <LoadError what="your jobs" code={error.code} />
      ) : ordered.length === 0 ? (
        <p className="rounded-card bg-surface p-5 text-sm text-ink-muted shadow-card ring-1 ring-line/70 ring-inset">
          {showDone ? "Nothing marked done yet." : "No open jobs."}
        </p>
      ) : (
        grouped.map(({ group, jobs: list }) => (
          <section key={group} className="flex flex-col gap-3" data-job-group={group}>
            <h2 className="px-1 text-xs font-bold tracking-wider text-ink-muted uppercase">
              {JOB_GROUP_LABELS[group as JobGroup]} · {list.length}
            </h2>
            {list.map((job) => (
              <JobCard key={job.id} job={job} group={group} companyId={session.companyId} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
