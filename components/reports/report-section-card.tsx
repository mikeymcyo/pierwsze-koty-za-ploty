import { ADVANCED_DETAILS_LABEL, type ReportGroup } from "@/lib/report-structure";

/**
 * One of a report's three visible sections, on screen.
 *
 * The same three groups the PDF prints - see lib/report-structure.ts - so what
 * a site manager works through on the phone is what the client receives, in
 * the same order and under the same headings. A screen that is organised one
 * way and a document organised another is how somebody finishes a report
 * believing it says something it does not.
 *
 * `advanced` is the escape hatch that makes three sections possible without
 * hiding anything: the workforce and plant rows, the document register, the
 * source record. All of it is still here, one tap away, and none of it is in
 * the way of the four things somebody actually does on site - talk, photograph,
 * raise what is wrong, and send it.
 *
 * A server component: it holds no state, and everything interactive inside it
 * brings its own client boundary.
 */
export function ReportSectionCard({
  group,
  children,
  advanced,
  advancedLabel = ADVANCED_DETAILS_LABEL,
  advancedHint,
}: {
  group: ReportGroup;
  children: React.ReactNode;
  /** Recorded data that belongs to this section but not in front of it. */
  advanced?: React.ReactNode;
  advancedLabel?: string;
  advancedHint?: string;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold tracking-tight text-ink">{group.label}</h2>
        <p className="text-sm text-ink-muted">{group.hint}</p>
      </div>

      {children}

      {advanced ? (
        <details className="rounded-xl border border-line bg-surface-muted p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {advancedLabel}
          </summary>
          {advancedHint ? <p className="mt-2 text-sm text-ink-muted">{advancedHint}</p> : null}
          <div className="mt-4 flex flex-col gap-6">{advanced}</div>
        </details>
      ) : null}
    </section>
  );
}

/**
 * The written report, put away until somebody wants to change it.
 *
 * On a Daily Report the words are dictated once and drafted by the AI, and the
 * drafted sections are output to read rather than a form to fill in. They are
 * shown as prose; this is how they are corrected when a correction is needed,
 * without a textarea standing between a site manager and the microphone.
 */
export function EditDisclosure({
  label = "Edit the written report",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-xl border border-line bg-surface-muted p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">{label}</summary>
      <div className="mt-4">{children}</div>
    </details>
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
