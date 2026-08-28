"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Download, FileCheck2, FileText } from "lucide-react";

import {
  finaliseSummaryReport,
  type SummaryFinaliseState,
} from "@/app/(app)/summary-reports/finalise-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function IssueButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending}>
      <FileCheck2 aria-hidden />{pending ? "Issuing…" : "Finalise and issue"}
    </Button>
  );
}

export function SummaryFinalise({
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
  const finalise = finaliseSummaryReport.bind(null, reportId);
  const [state, action] = useActionState<SummaryFinaliseState, FormData>(finalise, {});

  if (status === "final") {
    return (
      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Issued document</h2>
          <p className="mt-1 text-sm text-ink-muted">Finalised{finalisedAt ? ` on ${finalisedAt}` : ""}. This stored PDF is the immutable record.</p>
        </div>
        {pdfUrl ? (
          <Button asChild size="lg" className="self-start"><a href={pdfUrl} target="_blank" rel="noopener noreferrer"><Download aria-hidden />Open the PDF</a></Button>
        ) : (
          <Alert tone="danger">The stored PDF could not be reached just now. It has not been regenerated or replaced.</Alert>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Finalise</h2>
        <p className="mt-1 text-sm text-ink-muted">Preview it first. Finalising captures the current issue state, stores the PDF and freezes this report.</p>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <form action={action}><IssueButton /></form>
        <Button asChild variant="secondary" size="lg"><a href={`/summary-reports/${reportId}/preview`} target="_blank" rel="noopener noreferrer"><FileText aria-hidden />Preview PDF</a></Button>
      </div>
    </section>
  );
}
