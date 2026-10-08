"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Mic, Play } from "lucide-react";

import { addCapture } from "@/app/(app)/reports/capture-actions";
import { prepareDaily, type PrepareState } from "@/app/(app)/reports/prepare-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeActionFailure } from "@/lib/actions/recover";
import {
  clearCaptureDraft,
  readCaptureBusy,
  readCaptureDraft,
  setCaptureBusy,
  subscribeToCaptureDraft,
} from "@/lib/capture-draft";
import { useRecoverableActionState } from "@/lib/hooks/use-recoverable-action-state";
import { clockNow, saveUnsentThenPrepare } from "@/lib/reports/prepare-with-pending";

/**
 * The one button, and the one or two questions it may ask first.
 *
 * Pressed, it either opens the drafted report or comes back with what is
 * missing. The questions are answered in the box at the top of the same screen
 * - there is no second place to type - and "Prepare Daily anyway" is always
 * there, because a worker who genuinely did nothing on the listed items should
 * not be blocked from saying so.
 *
 * Whatever is still in that box when either button is pressed is added to the
 * day first, through the same capture the arrow uses. Both buttons share one
 * pending flag, so neither can be pressed while the other is working.
 */
function PrepareButton({
  label,
  force,
  pending,
  disabled,
  saving,
}: {
  label: string;
  force: boolean;
  pending: boolean;
  disabled: boolean;
  saving: boolean;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      variant={force ? "secondary" : "primary"}
      className={force ? "w-full text-base" : "h-16 w-full text-lg font-bold"}
      loading={pending}
      disabled={pending || disabled}
    >
      {pending ? null : <Play aria-hidden />}
      {pending ? (saving ? "Adding your note…" : "Preparing today's Daily…") : label}
    </Button>
  );
}

export function PrepareDaily({ reportId }: { reportId: string }) {
  // The capture's own request is on its way: wait for it rather than append
  // alongside it. Our own in-flight state is `pending` below.
  const busy = useSyncExternalStore(
    subscribeToCaptureDraft,
    () => readCaptureBusy(reportId),
    () => false,
  );
  const unsent = useSyncExternalStore(
    subscribeToCaptureDraft,
    () => readCaptureDraft(reportId).trim().length > 0,
    () => false,
  );

  /**
   * The form's action: the unsent words first, then Prepare Daily itself.
   *
   * A client function, so the save is confirmed and the phone's copy cleared
   * before the server action runs; a redirect out of prepareDaily passes
   * through untouched. The order is tested in lib/reports/prepare-with-pending.
   */
  const guarded = useCallback(
    async (previous: PrepareState, formData: FormData): Promise<PrepareState> => {
      const outcome = await saveUnsentThenPrepare<PrepareState>({
        pending: { text: readCaptureDraft(reportId), at: clockNow() },
        save: ({ text, at }) => {
          const capture = new FormData();
          capture.set("capture_text", text);
          capture.set("captured_at", at);
          return addCapture(reportId, {}, capture);
        },
        prepare: () => prepareDaily(reportId, previous, formData),
        clearDraft: () => clearCaptureDraft(reportId),
        setBusy: (value) => setCaptureBusy(reportId, value),
        describeFailure: describeActionFailure,
      });
      return outcome.kind === "prepared" ? outcome.state : { error: outcome.error };
    },
    [reportId],
  );

  const [state, action, pending] = useRecoverableActionState<PrepareState, FormData>(guarded, {});
  const asked = state.questions && state.questions.length > 0;
  // While pending, the first thing happening is the note going in if there
  // was one; the label says so, then switches once the box is empty.
  const saving = pending && busy;

  return (
    <div className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.unreadNote ? <Alert tone="info">{state.unreadNote}</Alert> : null}

      {asked ? (
        <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card ring-1 ring-line/70 ring-inset">
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
            Answer in the box at the top, then press Prepare Daily again. Anything still in the
            box is added first.
          </p>
          <form action={action}>
            <input type="hidden" name="force" value="1" />
            <PrepareButton label="Prepare Daily anyway" force pending={pending} disabled={busy} saving={saving} />
          </form>
        </div>
      ) : null}

      <form action={action}>
        <PrepareButton label="Prepare Daily" force={false} pending={pending} disabled={busy} saving={saving} />
      </form>
      {unsent && !pending ? (
        <p className="px-1 text-xs text-ink-subtle">
          The words still in the box go in first.
        </p>
      ) : null}
    </div>
  );
}
