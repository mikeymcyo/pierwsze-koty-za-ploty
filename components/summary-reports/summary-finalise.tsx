"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FileCheck2, FileText } from "lucide-react";

import {
  finaliseSummaryReport,
  type SummaryFinaliseState,
} from "@/app/(app)/summary-reports/finalise-actions";
import { ReopenSummaryReport } from "@/components/summary-reports/summary-lifecycle";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function IssueButton({ reissue }: { reissue: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending}>
      <FileCheck2 aria-hidden />
      {pending ? "Issuing…" : reissue ? "Finalise again" : "Finalise and issue"}
    </Button>
  );
}

export function SummaryFinalise({
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
  const finalise = finaliseSummaryReport.bind(null, reportId);
  const [state, action] = useActionState<SummaryFinaliseState, FormData>(finalise, {});
  const reopened = status === "draft" && hasPdf;

  if (status === "final") {
    return (
      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Issued document</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Finalised{finalisedAt ? ` on ${finalisedAt}` : ""}. This stored PDF is the issued record.
          </p>
        </div>

        <Button asChild size="lg" className="self-start">
          <Link href={`/summary-reports/${reportId}/pdf`}>
            <FileText aria-hidden />
            Open the PDF
          </Link>
        </Button>

        <ReopenSummaryReport reportId={reportId} finalisedAt={finalisedAt} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
          {reopened ? "Reopened for editing" : "Finalise"}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {reopened
            ? "Make your corrections, then issue the report again. The PDF already sent stays in place until you do."
            : "Preview it first. Finalising captures the current issue state, stores the PDF and freezes this report."}
        </p>
      </div>

      {reopened ? (
        <Alert tone="info">
          The previously issued PDF is still the current document. Finalising again replaces it and
          records this as the next revision; leaving the report as it is changes nothing.
        </Alert>
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <IssueButton reissue={reopened} />
        </form>

        <Button asChild variant="secondary" size="lg">
          <Link href={`/summary-reports/${reportId}/pdf${reopened ? "?draft=1" : ""}`}>
            <FileText aria-hidden />
            {reopened ? "Preview your changes" : "Preview PDF"}
          </Link>
        </Button>

        {reopened ? (
          <Button asChild variant="ghost" size="lg">
            <Link href={`/summary-reports/${reportId}/pdf`}>View the issued PDF</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
