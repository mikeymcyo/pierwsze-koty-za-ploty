/**
 * Picking up where somebody left off.
 *
 * A site manager searched Store 1848, having dictated into a Daily Report
 * against it that morning, and the store page offered him "Create project
 * here". He took it, because it was the only thing on the screen that looked
 * like an answer - and the project he already had, with 772 characters of his
 * own words in it, sat unmentioned below the fold under a grey heading.
 *
 * Nothing was lost and nothing was broken: the store-to-project link was
 * written, the query that reads it was correct, and the Daily Report was there
 * the whole time. What was wrong is the order of the screen. The most likely
 * thing somebody wants at a store they are standing in is the work they already
 * started there, and it was the last thing offered.
 *
 * This module decides what that work is. Pure, with no runtime imports and no
 * path aliases, so a test loads it into Node without a database.
 */

/** A Daily Report still open, as the continuity card needs it. */
export type DraftDaily = {
  id: string;
  projectId: string;
  projectName: string;
  reportNumber: number;
  /** The working day it belongs to, `YYYY-MM-DD`. */
  reportDate: string;
  /** When anything on it last changed. Maintained by the set_updated_at trigger. */
  updatedAt: string;
  /** How many capture entries are already in it. */
  captureCount: number;
};

/**
 * A project at this store, as the store page reads it.
 *
 * `Status` is a parameter rather than the database union: this module has no
 * runtime imports, so it cannot name that union without pulling the types file
 * in - and the caller already has it.
 */
export type ProjectHere<Status extends string = string> = {
  id: string;
  name: string;
  reference: string | null;
  status: Status;
};

/**
 * The one Daily to offer, out of everything still open.
 *
 * Today's first - that is the report a capture would append to, and the one
 * the words just spoken went into. Failing that, the most recently touched:
 * a Daily left open yesterday is still unfinished work, and saying so is
 * better than pretending the store is untouched. Where two are open for the
 * same day, the one worked on last wins.
 */
export function captureInProgress(
  drafts: readonly DraftDaily[],
  today: string,
): DraftDaily | null {
  if (drafts.length === 0) return null;
  const byRecency = [...drafts].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return byRecency.find((draft) => draft.reportDate === today) ?? byRecency[0] ?? null;
}

/**
 * Where Continue goes.
 *
 * Straight at the report that already exists, by its own id. Not through the
 * open-or-create action: a route that could create is a route that will, and
 * the whole point of this card is that there is already one.
 */
export function continueCaptureHref(draft: { id: string }): string {
  return `/reports/${draft.id}/capture`;
}

/** Where Open Project goes. */
export function projectHref(project: { id: string }): string {
  return `/projects/${project.id}`;
}

/**
 * Whether a project is work in hand or work in the past.
 *
 * A survey is an enquiry rather than a live job, but it is still something
 * somebody is doing now - it belongs above the fold with the active work, not
 * filed with the finished.
 */
export function isCurrent(project: { status: string }): boolean {
  return project.status === "active" || project.status === "survey";
}

/** Work in hand first, finished work below it, each keeping its own order. */
export function splitProjects<Status extends string>(
  projects: readonly ProjectHere<Status>[],
): {
  current: ProjectHere<Status>[];
  historical: ProjectHere<Status>[];
} {
  return {
    current: projects.filter(isCurrent),
    historical: projects.filter((project) => !isCurrent(project)),
  };
}

/**
 * "updated 12 minutes ago", in the words somebody would use out loud.
 *
 * Deliberately coarse. The exact second is not the point; whether this is
 * something from ten minutes ago or from last Tuesday is.
 */
export function describeLastUpdated(updatedAt: string, now: Date = new Date()): string {
  const then = new Date(updatedAt).getTime();
  if (!Number.isFinite(then)) return "updated recently";

  const minutes = Math.floor((now.getTime() - then) / 60000);
  if (minutes < 1) return "updated just now";
  if (minutes === 1) return "updated 1 minute ago";
  if (minutes < 60) return `updated ${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "updated 1 hour ago";
  if (hours < 24) return `updated ${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "updated yesterday" : `updated ${days} days ago`;
}

/**
 * What the card says it is holding.
 *
 * The count is the reassurance: somebody who dictated three times wants to see
 * that all three are still there before he taps anything.
 */
export function describeCaptureProgress(draft: DraftDaily): string {
  if (draft.captureCount === 0) return "Nothing captured yet";
  return draft.captureCount === 1 ? "1 note captured" : `${draft.captureCount} notes captured`;
}
