"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Download, FileCheck2, FileText } from "lucide-react";

import { finaliseReport, type FinaliseState } from "@/app/(app)/reports/finalise-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function FinaliseButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
      <FileCheck2 aria-hidden />
      {pending ? "Issuing…" : "Finalise report"}
    </Button>
  );
}

/**
 * Finalising, and what you get afterwards.
 *
 * Two different things share this space on purpose. While the report is a
 * draft, the PDF on offer is a preview and is labelled as one - it is not the
 * issued record and is not stored. Once finalised, the stored PDF is the only
 * one there is, and the button downloads that exact file rather than
 * re-rendering today's data under an old date.
 */
export function FinaliseReport({
  reportId,
  status,
  pdfUrl,
  finalisedAt,
}: {
  reportId: string;
  status: "draft" | "final";
  pdfUrl: string | null;
  finalisedAt: string | null;
}) {
  const finalise = finaliseReport.bind(null, reportId);
  const [state, formAction] = useActionState<FinaliseState, FormData>(finalise, {});

  if (status === "final") {
    return (
      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
            Issued report
          </h2>
          <p className="text-sm text-ink-muted">
            {finalisedAt
              ? `Finalised on ${finalisedAt}. This PDF is the record that was issued - it is not regenerated.`
              : "This report has been finalised. Its PDF is the record that was issued."}
          </p>
        </div>

        {pdfUrl ? (
          <Button asChild size="lg" className="w-full sm:w-auto">
            {/* Not a Next Link: this is a signed storage URL, not a route. */}
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <Download aria-hidden />
              Open the PDF
            </a>
          </Button>
        ) : (
          <Alert tone="danger">
            The stored PDF could not be reached just now. Try again in a moment - it
            has not been lost.
          </Alert>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
          Finalise
        </h2>
        <p className="text-sm text-ink-muted">
          Check the report reads the way you want it to. Finalising produces the
          PDF for the client and closes the report - after that it is the issued
          record and is not edited.
        </p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <form action={formAction}>
          <FinaliseButton />
        </form>

        <Button asChild variant="secondary" size="lg">
          <a href={`/reports/${reportId}/preview`} target="_blank" rel="noopener noreferrer">
            <FileText aria-hidden />
            Preview PDF
          </a>
        </Button>
      </div>

      <p className="text-xs text-ink-subtle">
        The preview is a draft, not the issued record.
      </p>
    </section>
  );
}
