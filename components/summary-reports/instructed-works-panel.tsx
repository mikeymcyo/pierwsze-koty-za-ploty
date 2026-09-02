import { Badge } from "@/components/ui/badge";
import {
  plateCell,
  type InstructedWorks,
  type InstructedWorkStatus,
} from "@/lib/summary-reports/instructed-works";

/**
 * The instructed works table, on screen, exactly as the PDF prints it.
 *
 * It is stored as JSON in its own section, so without this the report screen
 * would show a paragraph of braces - or, worse, nothing at all while the PDF
 * carried a table nobody had seen. Everything the document prints from this
 * payload is here: the rows, how the works were carried out, and the
 * materials, each appearing only where the document would show it.
 *
 * A server component. It reads nothing and holds nothing.
 */
const STATUS_TONE: Record<InstructedWorkStatus, "success" | "warning" | "neutral" | "danger"> = {
  Complete: "success",
  "Partially complete": "warning",
  "Not confirmed": "neutral",
  "Not carried out": "danger",
};

export function InstructedWorksPanel({ works }: { works: InstructedWorks }) {
  const unconfirmed = works.rows.filter((row) => row.status === "Not confirmed").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold tracking-wide text-ink-muted uppercase">
          Instructed works and status
        </h3>

        {/* Cards rather than a grid: five columns cannot be read on a phone,
            and this is the part of the report a client checks first. */}
        <ul className="flex flex-col gap-2">
          {works.rows.map((row, index) => (
            <li key={`${row.instruction}-${index}`} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-medium text-ink">
                  {row.instruction}
                  {row.location ? (
                    <span className="font-normal text-ink-muted">{` · ${row.location}`}</span>
                  ) : null}
                </p>
                <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {row.worksCarriedOut.trim() || "The record does not say what was done."}
              </p>
              {row.plateRefs.length > 0 ? (
                <p className="mt-1 font-mono text-xs text-ink-subtle">
                  {plateCell(row.plateRefs)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {unconfirmed > 0 ? (
          <p className="text-xs text-ink-subtle">
            {unconfirmed === 1 ? "One item is" : `${unconfirmed} items are`} shown as Not
            confirmed: the site record does not say what was done. This is not a statement that
            the work was not carried out.
          </p>
        ) : null}
      </div>

      {works.workstreams.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold tracking-wide text-ink-muted uppercase">
            How the works were carried out
          </h3>
          {works.workstreams.map((stream, index) => (
            <p key={`${stream.heading}-${index}`} className="text-sm text-ink">
              <span className="font-semibold">{stream.heading}. </span>
              <span className="text-ink-muted">{stream.body}</span>
              {stream.plateRefs.length > 0 ? (
                <span className="font-mono text-xs text-ink-subtle">{` (${stream.plateRefs.join(", ")})`}</span>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}

      {works.materials.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold tracking-wide text-ink-muted uppercase">Materials</h3>
          <ul className="flex flex-col gap-1">
            {works.materials.map((entry, index) => (
              <li key={`${entry.material}-${index}`} className="text-sm text-ink">
                <span className="font-medium">{entry.material}</span>
                <span className="text-ink-muted">{` — ${entry.use}`}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
