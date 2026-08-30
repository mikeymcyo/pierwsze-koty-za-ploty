"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { generateReport, updateSection, type AiState } from "@/app/(app)/reports/ai-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_SECTION_LABELS } from "@/lib/report-sections";
import { describeRegeneration } from "@/lib/reports/regeneration";
import type { ReportSection } from "@/types/database";

type DraftSection = Pick<ReportSection, "id" | "section_type" | "content" | "ai_generated">;

function GenerateButton({ hasDraft }: { hasDraft: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
      <Sparkles aria-hidden />
      {pending ? "Writing…" : hasDraft ? "Rewrite from my notes" : "Write my report"}
    </Button>
  );
}

function SaveSectionButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending} className="self-start">
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function SectionEditor({
  reportId,
  section,
}: {
  reportId: string;
  section: DraftSection;
}) {
  const save = updateSection.bind(null, reportId);
  const [state, formAction] = useActionState<AiState, FormData>(save, {});

  // Controlled rather than defaultValue. An uncontrolled textarea that is typed
  // into before React hydrates can end up merging the typed text with the
  // server-rendered value, and a silently spliced paragraph in a report that
  // goes to a client is exactly the kind of wrongness this app must not
  // produce. The parent keys this component on the section's content, so a
  // saved or regenerated value remounts it and reseeds the state.
  const [value, setValue] = useState(section.content ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="sectionId" value={section.id} />

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
          {REPORT_SECTION_LABELS[section.section_type]}
        </h3>
        {section.ai_generated ? (
          <Badge tone="info">Written by AI</Badge>
        ) : (
          <Badge tone="neutral">Edited by you</Badge>
        )}
      </div>

      <Textarea
        name="content"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={4}
        aria-label={REPORT_SECTION_LABELS[section.section_type]}
      />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SaveSectionButton />
    </form>
  );
}

/**
 * The button that writes the report, and the words it was written from.
 *
 * One press drafts every section of the report, so this is one control rather
 * than one per section - but the sections it produces are now shown under the
 * three headings the report actually has, which is why the editors below live
 * in `ReportSectionEditors` and are placed by the page rather than all stacked
 * here. See lib/report-structure.ts.
 *
 * The raw notes panel is not decoration: the user has to be able to check what
 * the model wrote against what they actually said, on the same screen, before
 * anything goes to a client. It is never overwritten by generation.
 */
export function ReportWriter({
  reportId,
  hasDraft,
  rawNotes,
  configured,
}: {
  reportId: string;
  /** Whether anything has been drafted yet, so the button says the right thing. */
  hasDraft: boolean;
  rawNotes: string | null;
  configured: boolean;
}) {
  const generate = generateReport.bind(null, reportId);
  const [state, formAction] = useActionState<AiState, FormData>(generate, {});
  const hasNotes = Boolean(rawNotes?.trim());

  return (
    <div className="flex flex-col gap-4">
      {!configured ? (
        // No dead buttons: if the key is missing, say so rather than offering a
        // control that would fail.
        <Alert tone="info">
          AI drafting is not switched on for this deployment. Add an
          OPENAI_API_KEY and it will appear here. Your notes are still saved.
        </Alert>
      ) : !hasNotes ? (
        <Alert tone="info">
          Write or dictate the day&apos;s work above and save the draft first -
          then this can turn it into a report.
        </Alert>
      ) : (
        <form action={formAction}>
          <GenerateButton hasDraft={hasDraft} />
        </form>
      )}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {!state.error && state.generated !== undefined ? (
        <Alert tone="info">
          {describeRegeneration({ generated: state.generated, kept: state.kept ?? 0 })}
        </Alert>
      ) : null}

      {hasNotes ? (
        <details className="rounded-xl border border-line bg-surface-muted p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            What you actually said
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">{rawNotes}</p>
        </details>
      ) : null}
    </div>
  );
}

/**
 * The editable sections belonging to one of the report's three groups.
 *
 * Each is still its own row in report_sections and its own form: the grouping
 * is presentation, and an edit still saves one section and flips only that one
 * to "Edited by you".
 */
export function ReportSectionEditors({
  reportId,
  sections,
}: {
  reportId: string;
  sections: DraftSection[];
}) {
  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <SectionEditor
          key={`${section.id}:${section.content ?? ""}`}
          reportId={reportId}
          section={section}
        />
      ))}
    </div>
  );
}
