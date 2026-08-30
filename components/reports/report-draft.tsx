"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import { generateReport, type AiState } from "@/app/(app)/reports/ai-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeRegeneration } from "@/lib/reports/regeneration";

function GenerateButton({ hasDraft }: { hasDraft: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
      <Sparkles aria-hidden />
      {pending ? "Writing…" : hasDraft ? "Rewrite from my notes" : "Write my report"}
    </Button>
  );
}

/**
 * The button that writes the report, and the words it was written from.
 *
 * One press drafts every section of the report, so this is one control rather
 * than one per section. What it produces is edited in the report's three
 * writing boxes - one per visible section, see
 * components/reports/group-editor.tsx - rather than in eight textareas stacked
 * under a heading.
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
