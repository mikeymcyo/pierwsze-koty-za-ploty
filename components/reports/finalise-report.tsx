"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FileCheck2, FileText } from "lucide-react";

import { finaliseReport, type FinaliseState } from "@/app/(app)/reports/finalise-actions";
import { ReopenReport } from "@/components/reports/report-lifecycle";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function FinaliseButton({ reissue }: { reissue: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
      <FileCheck2 aria-hidden />
      {pending ? "Issuing…" : reissue ? "Finalise again" : "Finalise report"}
    </Button>
  );
}

/**
 * Finalising, and what you get afterwards.
 *
 * Three states share this space. A plain draft offers a preview and the button
 * that issues it. An issued report offers the stored PDF and the way back into
 * editing. A reopened report - a draft that already has an issued PDF - is the
 * one worth being careful about: the document the client holds has not been
 * withdrawn, and saying so plainly is what stops somebody re-issuing in a panic.
 */
export function FinaliseReport({
  reportId,
  status,
  hasPdf,
  finalisedAt,
}: {
  reportId: string;
  status: "draft" | "final";
  hasPdf: boolean;
  finalisedAt: string | null;
}) {
  const finalise = finaliseReport.bind(null, reportId);
  const [state, formAction] = useActionState<FinaliseState, FormData>(finalise, {});
  const reopened = status === "draft" && hasPdf;

  if (status === "final") {
    return (
      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Issued report</h2>
          <p className="text-sm text-ink-muted">
            {finalisedAt
              ? `Finalised on ${finalisedAt}. This PDF is the record that was issued - it is not regenerated.`
              : "This report has been finalised. Its PDF is the record that was issued."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`/reports/${reportId}/pdf`}>
              <FileText aria-hidden />
              Open the PDF
            </Link>
          </Button>
        </div>

        <ReopenReport reportId={reportId} finalisedAt={finalisedAt} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
          {reopened ? "Reopened for editing" : "Finalise"}
        </h2>
        <p className="text-sm text-ink-muted">
          {reopened
            ? "Make your corrections, then issue the report again. The PDF already sent stays in place until you do."
            : "Check the report reads the way you want it to. Finalising produces the PDF for the client and closes the report - after that it is the issued record and is not edited."}
        </p>
      </div>

      {reopened ? (
        <Alert tone="info">
          The previously issued PDF is still the current document. Finalising again replaces it; leaving
          this report as it is changes nothing.
        </Alert>
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <form action={formAction}>
          <FinaliseButton reissue={reopened} />
        </form>

        <Button asChild variant="secondary" size="lg">
          <Link href={`/reports/${reportId}/pdf${reopened ? "?draft=1" : ""}`}>
            <FileText aria-hidden />
            {reopened ? "Preview your changes" : "Preview PDF"}
          </Link>
        </Button>

        {reopened ? (
          <Button asChild variant="ghost" size="lg">
            <Link href={`/reports/${reportId}/pdf`}>View the issued PDF</Link>
          </Button>
        ) : null}
      </div>

      {reopened ? null : (
        <p className="text-xs text-ink-subtle">The preview is a draft, not the issued record.</p>
      )}
    </section>
  );
}
