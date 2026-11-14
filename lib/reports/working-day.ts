/**
 * Which day's report a site is on.
 *
 * A Daily Report belongs to the day the site manager was standing on site, and
 * that is a British day. `reports.report_date` defaults to `current_date`,
 * which on a Supabase instance is UTC - so between midnight and 01:00 British
 * Summer Time the two disagree by a day. Somebody finishing up at 00:30 on a
 * summer night would have Site Capture look for a report dated the 1st and the
 * database create one dated the 31st, and the next tap would find nothing and
 * start a second report for the same night.
 *
 * So the working day is resolved here, in one place, and Site Capture writes it
 * onto the row rather than letting the column default decide. Lookup and
 * creation then use the same date by construction, which is what makes the
 * duplicate impossible rather than unlikely.
 *
 * Europe/London for now, for every site. Sites abroad and per-project
 * timezones are a real thing and are not built yet; when they are, this is the
 * one function that learns about them and the callers do not change.
 *
 * No runtime imports and no path aliases, so a test can load it straight into
 * Node.
 */

/** The one timezone every site is assumed to be in, until sites say otherwise. */
export const SITE_TIME_ZONE = "Europe/London";

/**
 * The calendar date on site, as `YYYY-MM-DD`.
 *
 * Falls back to UTC if the runtime has no timezone data, which is the same
 * behaviour as before this existed - a wrong hour on one winter night is a far
 * smaller fault than a screen that throws.
 */
export function workingDay(now: Date = new Date(), timeZone: string = SITE_TIME_ZONE): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const of = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const year = of("year");
    const month = of("month");
    const day = of("day");

    // Assembled from the parts rather than from a formatted string, so no
    // locale's idea of what order a date goes in can reorder it.
    if (year.length === 4 && month.length === 2 && day.length === 2) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Intl without full timezone data. Fall through.
  }
  return now.toISOString().slice(0, 10);
}
