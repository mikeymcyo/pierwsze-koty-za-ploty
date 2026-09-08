/**
 * Issue vocabulary, shared by the server actions, the screens and the PDF, so
 * it carries no "use client" directive and no runtime imports (F10).
 */

import type { IssuePriority, IssueStatus } from "@/types/database";

export const ISSUE_PRIORITIES: { value: IssuePriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

/**
 * "Resolved" is what a site manager calls a closed issue: the inserts came,
 * the section was finished, the item is done. The stored value stays `closed`
 * - it is an enum in Postgres and in every issued record - and only the word
 * on the screen and the page changes.
 */
export const ISSUE_STATUSES: { value: IssueStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Resolved" },
];

/** Whether a status means the issue is done, whatever it is labelled. */
export function isResolvedStatus(status: string | null | undefined): boolean {
  return status === "closed";
}

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = Object.fromEntries(
  ISSUE_PRIORITIES.map((p) => [p.value, p.label]),
) as Record<IssuePriority, string>;

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = Object.fromEntries(
  ISSUE_STATUSES.map((s) => [s.value, s.label]),
) as Record<IssueStatus, string>;

/** Rising urgency, so a critical item is unmistakable at arm's length in daylight. */
export const ISSUE_PRIORITY_TONES: Record<
  IssuePriority,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const ISSUE_STATUS_TONES: Record<IssueStatus, "neutral" | "info" | "success"> = {
  open: "info",
  in_progress: "neutral",
  closed: "success",
};

/**
 * Sorted the way a site manager reads them: worst first, then oldest first.
 *
 * An issue that has been open three weeks matters more than one raised this
 * morning at the same priority, so age breaks the tie rather than recency.
 */
export function sortIssues<
  T extends { priority: IssuePriority; created_at: string },
>(issues: readonly T[]): T[] {
  const rank: Record<IssuePriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...issues].sort(
    (a, b) => rank[a.priority] - rank[b.priority] || a.created_at.localeCompare(b.created_at),
  );
}

/** `closed_at` is set when an issue closes and cleared if it is reopened. */
export function closedAtFor(status: IssueStatus, existing: string | null): string | null {
  if (status === "closed") return existing ?? new Date().toISOString();
  return null;
}

/** A closed issue needs an outcome before it can appear honestly in a completion record. */
export function hasRequiredResolution(status: IssueStatus, resolution: string | null): boolean {
  return status !== "closed" || Boolean(resolution?.trim());
}

// ---------------------------------------------------------------------------
// Resolution suggested by the day's notes
// ---------------------------------------------------------------------------

/**
 * One issue the day's notes appear to have resolved, and the words to offer.
 *
 * Carried from Prepare Daily to the report screen in the URL rather than
 * stored: it is a suggestion about a moment, it is shown once, and the only
 * thing that changes an issue is the person pressing Confirm. Nothing is
 * resolved on their behalf.
 */
export type ResolutionSuggestion = { issueId: string; note: string };

const SUGGESTION_NOTE_MAX = 200;
const SUGGESTION_MAX = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The query string value carrying the suggestions. */
export function resolutionSuggestionsParam(suggestions: readonly ResolutionSuggestion[]): string {
  return encodeURIComponent(
    JSON.stringify(
      suggestions.slice(0, SUGGESTION_MAX).map((item) => ({
        issueId: item.issueId,
        note: item.note.trim().slice(0, SUGGESTION_NOTE_MAX),
      })),
    ),
  );
}

/**
 * The suggestions back out of the URL, and nothing else.
 *
 * Whatever reaches this came off a URL somebody could have typed, so only the
 * shape is trusted: a real-looking id and a short note. Which issues exist,
 * belong to this report and are still open is decided against the database
 * by the caller, never here.
 */
export function parseResolutionSuggestions(raw: string | null | undefined): ResolutionSuggestion[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: ResolutionSuggestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const issueId = (item as { issueId?: unknown }).issueId;
    const note = (item as { note?: unknown }).note;
    if (typeof issueId !== "string" || !UUID.test(issueId) || seen.has(issueId)) continue;
    seen.add(issueId);
    out.push({
      issueId,
      note: typeof note === "string" ? note.trim().slice(0, SUGGESTION_NOTE_MAX) : "",
    });
    if (out.length >= SUGGESTION_MAX) break;
  }
  return out;
}
