"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import {
  generateSummaryReport,
  updateSummarySection,
  type SummaryAiState,
} from "@/app/(app)/summary-reports/ai-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SUMMARY_SECTION_LABELS } from "@/lib/summary-reports/sections";
import type { SummaryReportSection } from "@/types/database";

type Section = Pick<SummaryReportSection, "id" | "section_type" | "content" | "ai_generated">;

function GenerateButton({ hasContent }: { hasContent: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending}>
      <Sparkles aria-hidden />
      {pending ? "Consolidating…" : hasContent ? "Regenerate from evidence" : "Write from evidence"}
    </Button>
  );
}

function SaveSectionButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending} className="self-start">
      {pending ? "Saving…" : "Save section"}
    </Button>
  );
}

function SectionEditor({ reportId, section }: { reportId: string; section: Section }) {
  const save = updateSummarySection.bind(null, reportId);
  const [state, action] = useActionState<SummaryAiState, FormData>(save, {});
  const [value, setValue] = useState(section.content ?? "");
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="sectionId" value={section.id} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
          {SUMMARY_SECTION_LABELS[section.section_type]}
        </h3>
        {section.content?.trim() ? (
          <Badge tone={section.ai_generated ? "info" : "neutral"}>
            {section.ai_generated ? "Written by AI" : "Edited by you"}
          </Badge>
        ) : null}
      </div>
      <Textarea
        name="content"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={5}
        aria-label={SUMMARY_SECTION_LABELS[section.section_type]}
        placeholder="Leave blank when the evidence does not support this section."
      />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SaveSectionButton />
    </form>
  );
}

export function SummaryDraft({
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
    <section className="flex flex-col gap-5 border-t border-line pt-6">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Written report</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Consolidate the issued evidence, then check every section. Anything you edit is protected from regeneration.
        </p>
      </div>
      {configured ? (
        <form action={action}><GenerateButton hasContent={hasContent} /></form>
      ) : (
        <Alert tone="info">AI drafting is not configured. You can still write and save every section manually.</Alert>
      )}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.generated !== undefined ? (
        <Alert tone="success">
          {state.generated} {state.generated === 1 ? "section" : "sections"} written from the evidence.
          {state.kept
            ? ` ${state.kept} section${state.kept === 1 ? "" : "s"} you edited ${
                state.kept === 1 ? "was" : "were"
              } kept.`
            : ""}
        </Alert>
      ) : null}
      <div className="flex flex-col gap-7">
        {sections.map((section) => (
          <SectionEditor key={`${section.id}:${section.content ?? ""}`} reportId={reportId} section={section} />
        ))}
      </div>
    </section>
  );
}
