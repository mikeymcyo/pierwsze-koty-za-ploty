"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Mic, Play } from "lucide-react";

import { prepareDaily, type PrepareState } from "@/app/(app)/reports/prepare-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The one button, and the one or two questions it may ask first.
 *
 * Pressed, it either opens the drafted report or comes back with what is
 * missing. The questions are answered with the microphone at the top of the
 * same screen - there is no second place to type - and "Prepare Daily anyway"
 * is always there, because a worker who genuinely did nothing on the listed
 * items should not be blocked from saying so.
 */
function PrepareButton({ label, force }: { label: string; force: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      variant={force ? "secondary" : "primary"}
      className="w-full text-base font-bold tracking-wide"
      loading={pending}
      disabled={pending}
    >
      {pending ? null : <Play aria-hidden />}
      {pending ? "Preparing today's Daily…" : label}
    </Button>
  );
}

export function PrepareDaily({ reportId }: { reportId: string }) {
  const [state, action] = useActionState<PrepareState, FormData>(
    prepareDaily.bind(null, reportId),
    {},
  );
  const asked = state.questions && state.questions.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.unreadNote ? <Alert tone="info">{state.unreadNote}</Alert> : null}

      {asked ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-muted p-4">
          <p className="text-sm font-semibold text-ink">Before I write today&rsquo;s Daily:</p>
          <ul className="flex flex-col gap-3">
            {state.questions?.map((question) => (
              <li key={question.id} className="flex items-start gap-3 text-sm text-ink">
                <Mic aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
                <span>{question.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-subtle">
            Use the microphone at the top, then press Prepare Daily again.
          </p>
          <form action={action}>
            <input type="hidden" name="force" value="1" />
            <PrepareButton label="Prepare Daily anyway" force />
          </form>
        </div>
      ) : null}

      <form action={action}>
        <PrepareButton label="PREPARE DAILY" force={false} />
      </form>
    </div>
  );
}
