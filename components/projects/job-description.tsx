"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ClipboardList } from "lucide-react";

import { addJobBriefEntry, type JobBriefState } from "@/app/(app)/projects/brief-actions";
import { DictationField } from "@/components/reports/dictation-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseJobBrief } from "@/lib/projects/job-brief";

/**
 * "What is this job?" - on the project, optional, and nowhere else.
 *
 * A sentence dictated in the van is valid scope on its own, and Prepare Daily
 * reads it as what was requested. It is not on Site Capture: that screen is
 * only ever about what happened. Appended, never rewritten, so what was said
 * at seven is still what was said at seven.
 */
function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" className="w-full sm:w-auto" loading={pending} disabled={pending || disabled}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function JobDescription({
  projectId,
  description,
}: {
  projectId: string;
  description: string | null;
}) {
  const [state, action] = useActionState<JobBriefState, FormData>(
    addJobBriefEntry.bind(null, projectId),
    {},
  );
  const [text, setText] = useState("");
  const entries = parseJobBrief(description).filter((entry) => !entry.documentId);
  const nothingToAdd = text.trim().length === 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-bold tracking-wide text-ink-muted uppercase">What is this job?</h2>
            {entries.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1">
                {entries.map((entry, index) => (
                  <li key={index} className="text-sm text-ink">
                    {entry.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">Optional. A sentence is enough.</p>
            )}
          </div>
        </div>

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {entries.length > 0 ? "Add to it" : "Say what the job is"}
          </summary>
          <form key={entries.length} action={action} className="mt-3 flex flex-col gap-3">
            <DictationField
              name="brief_text"
              label="What is this job?"
              value={text}
              onValueChange={setText}
              rows={3}
              placeholder="What have you been asked to do here?"
            />
            <input type="hidden" name="brief_at" value="" />
            <input type="hidden" name="return_to" value={`/projects/${projectId}`} />
            <SaveButton disabled={nothingToAdd} />
          </form>
        </details>
      </CardContent>
    </Card>
  );
}
