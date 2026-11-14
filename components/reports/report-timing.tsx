import { reportTiming } from "@/lib/reports/timing";

/**
 * The timing line under a report in a list.
 *
 * One line, subtle, and absent entirely rather than half-filled: a row that
 * cannot say when something happened should not say "Created —".
 */
export function ReportTiming({
  createdAt,
  finalisedAt,
}: {
  createdAt: string | null | undefined;
  finalisedAt: string | null | undefined;
}) {
  const timing = reportTiming(createdAt, finalisedAt);
  if (!timing.created && !timing.issued) return null;

  return (
    <span className="text-xs text-ink-subtle">
      {[timing.created, timing.issued].filter(Boolean).join(" · ")}
    </span>
  );
}
