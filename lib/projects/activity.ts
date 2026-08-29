/**
 * What has happened on this job, in order.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a database.
 *
 * There is no activity table and there should not be one. Every event here is
 * already recorded somewhere - a report exists, an issue was raised, an issue
 * was closed - and a second copy written alongside them would be one more
 * thing to keep in step, one more thing to get out of step, and a migration to
 * pay for it. The timeline is a view over records that already exist, built
 * from the columns those records already carry.
 *
 * Each item is identified by its kind and the row it came from, so the same
 * record can never appear twice however many times these lists are merged.
 */

export type ActivityKind =
  | "survey"
  | "daily"
  | "progress"
  | "completion"
  | "issue_raised"
  | "issue_closed";

export type ActivityItem = {
  /** kind:rowId - stable, and what makes a duplicate impossible. */
  id: string;
  kind: ActivityKind;
  /** When it happened, ISO. What the timeline sorts on. */
  at: string;
  title: string;
  /** One short line: where it stands, or what it was about. */
  detail: string | null;
  /** The record itself. */
  href: string;
};

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  survey: "Site survey",
  daily: "Daily report",
  progress: "Progress report",
  completion: "Completion report",
  issue_raised: "Issue raised",
  issue_closed: "Issue closed",
};

/** Chip tones, from the shared badge palette. */
export const ACTIVITY_TONES: Record<ActivityKind, "neutral" | "info" | "success" | "warning"> = {
  survey: "info",
  daily: "neutral",
  progress: "info",
  completion: "success",
  issue_raised: "warning",
  issue_closed: "success",
};

/** A date formatter supplied by the caller, so this module stays import-free. */
type Format = (value: string) => string | null;

const identity: Format = (value) => value;

/** "007" - the way a report is quoted. */
function numbered(value: number): string {
  return String(value).padStart(3, "0");
}

/** One line, short enough for a card on a phone. */
function trim(value: string | null | undefined, limit = 120): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function joined(parts: (string | null | undefined)[]): string | null {
  const kept = parts.filter((part): part is string => Boolean(part && part.trim()));
  return kept.length > 0 ? kept.join(" · ") : null;
}

export type DailyReportRow = {
  id: string;
  report_number: number;
  report_date: string;
  status: "draft" | "final";
  created_at: string;
};

/**
 * Daily reports.
 *
 * Placed at the moment the report was started rather than at the day it
 * covers, because that is when it happened on this job; the day it covers is
 * on the line beneath, where it belongs.
 */
export function dailyActivity(
  rows: readonly DailyReportRow[],
  format: Format = identity,
): ActivityItem[] {
  return rows.map((row) => ({
    id: `daily:${row.id}`,
    kind: "daily" as const,
    at: row.created_at,
    title: `Daily Report ${numbered(row.report_number)}`,
    detail: joined([
      row.report_date ? `For ${format(row.report_date) ?? row.report_date}` : null,
      row.status === "final" ? "Issued" : "Draft",
    ]),
    href: `/reports/${row.id}`,
  }));
}

export type SummaryReportRow = {
  id: string;
  kind: "progress" | "completion" | "survey";
  number: number;
  revision: number;
  title: string | null;
  period_start: string | null;
  period_end: string | null;
  status: "draft" | "final";
  created_at: string;
};

/**
 * Surveys, progress reports and completion reports.
 *
 * A survey's two period columns both hold the day of the visit, so it reads as
 * one date rather than as a span of no length.
 */
export function summaryActivity(
  rows: readonly SummaryReportRow[],
  format: Format = identity,
): ActivityItem[] {
  return rows.map((row) => {
    const label = ACTIVITY_LABELS[row.kind];
    const when =
      row.kind === "survey"
        ? row.period_start
          ? `Visited ${format(row.period_start) ?? row.period_start}`
          : null
        : row.period_start && row.period_end
          ? `${format(row.period_start) ?? row.period_start} to ${
              format(row.period_end) ?? row.period_end
            }`
          : null;

    return {
      id: `${row.kind}:${row.id}`,
      kind: row.kind,
      at: row.created_at,
      title: trim(row.title) ?? `${label} ${numbered(row.number)}`,
      detail: joined([
        when,
        row.status === "final" ? "Issued" : "Draft",
        row.revision ? `Rev ${row.revision}` : null,
      ]),
      href: `/summary-reports/${row.id}`,
    };
  });
}

export type IssueRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  resolution: string | null;
  created_at: string;
  closed_at: string | null;
};

/**
 * Issues, as the two events that matter: raised, and closed.
 *
 * Read from the issue's own columns rather than from its event history. The
 * history records every move between open and in progress, which is a log
 * rather than a job timeline - and `closed_at` already says when an issue was
 * put to bed. An issue that was closed, reopened and closed again shows one
 * closing, at the time it currently holds, which is the truth about where it
 * stands now.
 */
export function issueActivity(
  rows: readonly IssueRow[],
  priorityLabels: Record<string, string> = {},
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const row of rows) {
    items.push({
      id: `issue_raised:${row.id}`,
      kind: "issue_raised",
      at: row.created_at,
      title: trim(row.title) ?? "Issue",
      detail: joined([priorityLabels[row.priority] ?? row.priority, "priority"]),
      href: `/issues/${row.id}`,
    });

    if (row.closed_at) {
      items.push({
        id: `issue_closed:${row.id}`,
        kind: "issue_closed",
        at: row.closed_at,
        title: trim(row.title) ?? "Issue",
        detail: trim(row.resolution) ?? "Closed",
        href: `/issues/${row.id}`,
      });
    }
  }
  return items;
}

/**
 * The timeline: everything, newest first.
 *
 * Deduplicated by id, so a source counted twice - a query re-run, a list
 * merged into itself - cannot produce the same event twice. Ties break on the
 * id so the same data always produces the same order, which matters when two
 * records were created in the same second.
 *
 * Capped, because a project that has run for two years does not need to send a
 * thousand rows to a phone before anything appears.
 */
export function mergeActivity(
  groups: readonly (readonly ActivityItem[])[],
  limit = 100,
): ActivityItem[] {
  const byId = new Map<string, ActivityItem>();
  for (const group of groups) {
    for (const item of group) {
      if (item.at) byId.set(item.id, item);
    }
  }
  return [...byId.values()]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)))
    .slice(0, limit);
}

/** The day an item belongs under, for grouping the timeline. */
export function activityDay(item: ActivityItem): string {
  return item.at.slice(0, 10);
}

/**
 * The timeline broken into days, each day still newest first.
 *
 * Relies on the order it is given rather than sorting again, so a day cannot
 * appear twice and the days come out in the order the items did.
 *
 * The day is worked out by the caller because the answer depends on a
 * timezone, and this module has none.
 */
export function groupActivity(
  items: readonly ActivityItem[],
  day: (item: ActivityItem) => string = activityDay,
): { day: string; items: ActivityItem[] }[] {
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const key = day(item);
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(item);
    else groups.push({ day: key, items: [item] });
  }
  return groups;
}
