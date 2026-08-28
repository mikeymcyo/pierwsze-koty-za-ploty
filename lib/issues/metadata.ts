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

export const ISSUE_STATUSES: { value: IssueStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Closed" },
];

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
