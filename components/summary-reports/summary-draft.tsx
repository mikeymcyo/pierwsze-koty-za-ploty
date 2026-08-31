"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { generateSummaryReport, type SummaryAiState } from "@/app/(app)/summary-reports/ai-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

function GenerateButton({ hasContent }: { hasContent: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending}>
      <Sparkles aria-hidden />
      {pending ? "Consolidating…" : hasContent ? "Regenerate from evidence" : "Write from evidence"}
    </Button>
  );
}

/**
 * The button that writes the whole document, and what it reports afterwards.
 *
 * One press drafts every section, so this is one control. What it produces is
 * edited in the document's three writing boxes - one per visible section, see
 * components/reports/group-editor.tsx.
 */
export function SummaryWriter({
  reportId,
  sections,
  configured,
}: {
  reportId: string;
  sections: Section[];
  configured: boolean;
}) {
  const generate = generateSummaryReport.bind(null, reportId);
  const [state, action] = useActionState<SummaryAiState, FormData>(generate, {});
  const hasContent = sections.some((section) => section.content?.trim());
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Consolidate the issued evidence, then check every section. Anything you edit is protected from regeneration.
      </p>
      {configured ? (
        <form action={action}><GenerateButton hasContent={hasContent} /></form>
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
