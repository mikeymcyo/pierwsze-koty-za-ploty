/**
 * Open Jobs: which group a job falls in, and the order they are shown in.
 *
 * Pure, with no runtime imports, so the grouping is tested against a fixed
 * "today" without a database. The groups are worked out from the dates and
 * today's date every time the page is drawn - nothing about a job's urgency
 * is stored, because it changes by itself as the days pass.
 *
 *   FIXED      a fixed attendance date has been agreed
 *   OVERDUE    the target date has passed
 *   THIS WEEK  the target date is within the next seven days
 *   LATER      everything else, including jobs with no date at all
 */

/** The private bucket the PO PDFs live in - see the jobs migration. */
export const JOB_PO_BUCKET = "job-pos";

export type JobGroup = "fixed" | "overdue" | "this_week" | "later";

export const JOB_GROUP_ORDER: readonly JobGroup[] = ["fixed", "overdue", "this_week", "later"];

export const JOB_GROUP_LABELS: Record<JobGroup, string> = {
  fixed: "Fixed",
  overdue: "Overdue",
  this_week: "This week",
  later: "Later",
};

/** A job as the list needs it: only the dates and the name matter for order. */
export type JobLike = {
  store_name: string;
  fixed_date: string | null;
  fixed_time: string | null;
  target_date: string | null;
};

/** Days after a YYYY-MM-DD date, as another YYYY-MM-DD. Calendar days, no zones. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
}

/** Which group a job is in today. `today` is YYYY-MM-DD in the site's zone. */
export function groupOf(job: JobLike, today: string): JobGroup {
  if (job.fixed_date) return "fixed";
  if (!job.target_date) return "later";
  if (job.target_date < today) return "overdue";
  if (job.target_date <= addDays(today, 7)) return "this_week";
  return "later";
}

/** The date that orders a job within its group. */
function sortDate(job: JobLike): string {
  if (job.fixed_date) return `${job.fixed_date}T${job.fixed_time ?? "99:99"}`;
  // No target date sorts last.
  return job.target_date ?? "9999-12-31";
}

/** Group order, then date, then store name. Returns a new array. */
export function sortJobs<T extends JobLike>(jobs: readonly T[], today: string): T[] {
  return [...jobs].sort((a, b) => {
    const ga = JOB_GROUP_ORDER.indexOf(groupOf(a, today));
    const gb = JOB_GROUP_ORDER.indexOf(groupOf(b, today));
    if (ga !== gb) return ga - gb;
    const da = sortDate(a);
    const db = sortDate(b);
    if (da !== db) return da < db ? -1 : 1;
    return a.store_name.localeCompare(b.store_name);
  });
}

/** Turn-by-turn in Waze. */
export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

/** Directions in Google Maps. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * The line that says when: "Tue 27 Oct · AM (time TBC)" for a fixed job,
 * "Target Wed 22 Oct" otherwise, "No date" if there is none.
 */
export function whenLabel(job: { fixed_date: string | null; fixed_time: string | null; fixed_note: string | null; target_date: string | null }): string {
  if (job.fixed_date) {
    const time = job.fixed_time ? clock(job.fixed_time) : null;
    const extra = [time, job.fixed_note].filter(Boolean).join(" ");
    return extra ? `${dayLabel(job.fixed_date)} · ${extra}` : dayLabel(job.fixed_date);
  }
  if (job.target_date) return `Target ${dayLabel(job.target_date)}`;
  return "No date";
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 27 Oct" from YYYY-MM-DD. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return `${DAYS[date.getUTCDay()]} ${d} ${MONTHS[m! - 1]}`;
}

/** "05:00" from a Postgres time, which may carry seconds. */
export function clock(time: string): string {
  return time.slice(0, 5);
}

/** "Shoreham GB1443" split into the name and the GB code, if there is one. */
export function splitStore(store: string): { name: string; code: string | null } {
  const match = store.trim().match(/^(.*?)\s*(GB\d{3,5})$/i);
  if (!match) return { name: store.trim(), code: null };
  return { name: match[1]!.trim(), code: match[2]!.toUpperCase() };
}

/**
 * "2026-10-27 AM (time TBC)" or "2026-10-28 05:00" as the seed writes it,
 * split into the date, the clock time if any, and the rest as a note.
 */
export function parseFixed(value: string | undefined): { date: string | null; time: string | null; note: string | null } {
  if (!value) return { date: null, time: null, note: null };
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);
  if (!match) return { date: null, time: null, note: value.trim() || null };
  const rest = match[2]!.trim();
  const time = rest.match(/^(\d{2}:\d{2})(.*)$/);
  if (time) return { date: match[1]!, time: time[1]!, note: time[2]!.trim() || null };
  return { date: match[1]!, time: null, note: rest || null };
}
