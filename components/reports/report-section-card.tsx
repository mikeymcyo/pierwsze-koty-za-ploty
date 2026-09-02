import type { ReportGroup } from "@/lib/report-structure";

/**
 * One of a report's three visible sections, on screen.
 *
 * The same three groups the PDF prints - see lib/report-structure.ts - so what
 * a site manager works through on the phone is what the client receives, in
 * the same order and under the same headings. A screen that is organised one
 * way and a document organised another is how somebody finishes a report
 * believing it says something it does not.
 *
 * `records` is the recorded data that belongs to this section: the workforce
 * and plant rows, the document register, the source record. It sits inline,
 * under its own quiet heading, and never behind a disclosure - all of it is
 * printed in the issued PDF, and anything that can reach the client has to be
 * on the screen the person signed off. It used to be folded away under
 * "Advanced details", which meant a report exported an appendix nobody had
 * opened.
 *
 * Pass nothing where there is nothing: a heading over an empty list is clutter
 * on a phone, and "No documents were referenced" is a sentence nobody needs.
 *
 * A server component: it holds no state, and everything interactive inside it
 * brings its own client boundary.
 */
export function ReportSectionCard({
  group,
  children,
  records,
  recordsLabel,
  recordsHint,
}: {
  group: ReportGroup;
  children: React.ReactNode;
  /** Recorded data that belongs to this section. Omit when there is none. */
  records?: React.ReactNode;
  recordsLabel?: string;
  recordsHint?: string;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold tracking-tight text-ink">{group.label}</h2>
        <p className="text-sm text-ink-muted">{group.hint}</p>
      </div>
      {children}
      {records ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {recordsLabel ? (
            <h3 className="text-xs font-bold tracking-wide text-ink-muted uppercase">
              {recordsLabel}
            </h3>
          ) : null}
          {recordsHint ? <p className="text-sm text-ink-muted">{recordsHint}</p> : null}
          <div className="flex flex-col gap-6">{records}</div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * A written section inside a group, read-only.
 *
 * The run-in label is the same device the PDF uses: three headings on the
 * page, and every stored section still named, because the difference between
 * work recorded as completed and work recorded as planned is what a reading of
 * this document months later turns on.
 */
export function ReadOnlySection({
  label,
  content,
}: {
  label: string | null;
  content: string;
}) {
  return (
    <p className="whitespace-pre-wrap text-ink">
      {label ? <span className="font-semibold text-ink">{`${label} `}</span> : null}
      {content}
    </p>
  );
}
