import { formatTime, ukDay } from "@/lib/utils";

/**
 * When a report was started, and when it went out.
 *
 * A list of reports is read for chronology before it is read for anything
 * else: which of these came first, and has this one actually gone to the
 * client yet. The report date alone does not answer either question - two
 * reports can carry the same date, and a report dated Monday may have been
 * written on Monday evening and issued on Wednesday.
 *
 * Deliberately terse, because it sits under a title on a phone. The date is
 * dropped from the issued half when it falls on the same day as the creation,
 * which is the common case and where repeating it says nothing; the year
 * appears only when the report is not from this one.
 */

/** The site is in the UK and the servers are on UTC. See lib/utils.ts. */
const UK_TIME_ZONE = "Europe/London";

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: UK_TIME_ZONE,
});

const SHORT_DAY_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: UK_TIME_ZONE,
});

function shortDay(value: string, now: Date): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = ukDay(value).slice(0, 4) === ukDay(now.toISOString()).slice(0, 4);
  return (sameYear ? SHORT_DAY : SHORT_DAY_YEAR).format(date);
}

export type ReportTiming = {
  /** "Created 25 Aug, 14:32", or null when there is no usable timestamp. */
  created: string | null;
  /** "Issued 17:05", or "Issued 26 Aug, 09:10" across a day. Null if a draft. */
  issued: string | null;
};

export function reportTiming(
  createdAt: string | null | undefined,
  finalisedAt: string | null | undefined,
  now: Date = new Date(),
): ReportTiming {
  const createdDay = createdAt ? shortDay(createdAt, now) : null;
  const createdTime = formatTime(createdAt);
  const created = createdDay && createdTime ? `Created ${createdDay}, ${createdTime}` : null;

  const issuedTime = formatTime(finalisedAt);
  if (!finalisedAt || !issuedTime) return { created, issued: null };

  // Same day as it was started: the date is already on the line and repeating
  // it costs a phone's width for nothing.
  if (createdAt && ukDay(createdAt) === ukDay(finalisedAt)) {
    return { created, issued: `Issued ${issuedTime}` };
  }

  const issuedDay = shortDay(finalisedAt, now);
  return {
    created,
    issued: issuedDay ? `Issued ${issuedDay}, ${issuedTime}` : `Issued ${issuedTime}`,
  };
}
