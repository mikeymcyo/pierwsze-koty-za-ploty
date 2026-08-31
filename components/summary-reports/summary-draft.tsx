"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { generateSummaryReport, type SummaryAiState } from "@/app/(app)/summary-reports/ai-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  CONSOLIDATION_HELPER,
  generateLabel,
  type SourceCounts,
} from "@/lib/summary-reports/source-summary";
import type { SummaryReportSection } from "@/types/database";

type Section = Pick<SummaryReportSection, "id" | "section_type" | "content" | "ai_generated">;

/** What the evidence actually was, in the words a site manager would use. */
function describeEvidence(progress: number, daily: number): string {
  const parts = [
    progress > 0 ? `${progress} Progress Report${progress === 1 ? "" : "s"}` : null,
    daily > 0 ? `${daily} Daily Report${daily === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" and ") : "what you recorded here";
}

function GenerateButton({ label, dominant }: { label: string; dominant: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      loading={pending}
      // The one thing to do on a report that has sources and no words yet.
      // Full width and taller on a phone, where it is the first thing under
      // the heading and the empty boxes are below it.
      className={dominant ? "h-14 w-full text-base" : undefined}
    >
      <Sparkles aria-hidden />
      {pending ? "Consolidating…" : label}
    </Button>
  );
}

/**
 * The button that writes the whole document, and what it reports afterwards.
 *
 * One press drafts every section, so this is one control. What it produces is
 * edited in the document's writing boxes - see components/reports/group-editor.tsx.
 *
 * ## Why it says which reports
 *
 * It used to say "Write from evidence" above empty boxes. A site manager who
 * had just ticked two Daily Reports read that as "your reports are gone, type
 * the job again" - which is exactly what it looks like, and the reports were
 * sitting frozen on the document all along. It now names them and counts them,
 * and says in a line underneath that typing is optional.
 *
 * Nothing generates on its own. A document that rewrote itself when somebody
 * opened it would be worse than one that says nothing.
 */
export function SummaryWriter({
  reportId,
  sections,
  configured,
  sources,
}: {
  reportId: string;
  sections: Section[];
  configured: boolean;
  /** What this document was built from. Empty on one written directly. */
  sources: SourceCounts;
}) {
  const generate = generateSummaryReport.bind(null, reportId);
  const [state, action] = useActionState<SummaryAiState, FormData>(generate, {});
  const hasContent = sections.some((section) => section.content?.trim());
  const consolidating = sources.daily.length + sources.progress.length > 0;
  // Sources ticked, nothing written yet: this is the whole job of the screen.
  const dominant = consolidating && !hasContent;

  return (
    <div className="flex flex-col gap-4">
      <p className={dominant ? "text-sm text-ink" : "text-sm text-ink-muted"}>
        {consolidating
          ? CONSOLIDATION_HELPER
          : "Write each section below, then check it before issuing. Anything you edit is protected from regeneration."}
      </p>
      {configured ? (
        <form action={action}>
          <GenerateButton label={generateLabel(sources, hasContent)} dominant={dominant} />
        </form>
      ) : (
        <Alert tone="info">AI drafting is not configured. You can still write and save every section manually.</Alert>
      )}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.generated !== undefined ? (
        <Alert tone="success">
          {/* Named sources, not just a count of sections. A consolidation that
              silently read nothing used to look identical to one that read two
              rich Daily Reports, and there was no way to tell from the phone. */}
          {state.generated} {state.generated === 1 ? "section" : "sections"} written from{" "}
          {describeEvidence(state.fromProgress ?? 0, state.fromDaily ?? 0)}.
          {state.kept
            ? ` ${state.kept} section${state.kept === 1 ? "" : "s"} you edited ${
                state.kept === 1 ? "was" : "were"
              } kept.`
            : ""}
        </Alert>
      ) : null}
    </div>
  );
}
