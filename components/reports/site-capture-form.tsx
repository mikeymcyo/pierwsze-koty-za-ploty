"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";

import type { CaptureState } from "@/app/(app)/reports/capture-actions";
import { DictationField } from "@/components/reports/dictation-field";
import { Alert } from "@/components/ui/alert";
import {
  clearCaptureDraft,
  readCaptureBusy,
  readCaptureDraft,
  setCaptureBusy,
  subscribeToCaptureDraft,
  writeCaptureDraft,
} from "@/lib/capture-draft";
import { clockNow } from "@/lib/reports/prepare-with-pending";
import { useRecoverableActionState } from "@/lib/hooks/use-recoverable-action-state";

/** Saving… / Saved / nothing. Never "saved" before the server says so. */
function SaveStatus({ savedAt, failed }: { savedAt?: string; failed: boolean }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="text-xs text-ink-subtle">Saving…</span>;
  if (failed) return <span className="text-xs text-danger">Not saved - your words are safe here</span>;
  if (savedAt !== undefined) {
    return (
      <span className="flex items-center gap-1 text-xs text-ink-muted">
        <Check aria-hidden className="size-3.5" />
        Added{savedAt ? ` at ${savedAt}` : ""}. It all goes on the same report.
      </span>
    );
  }
  return null;
}

/**
 * Tells the store while this form's capture is on its way, so Prepare Daily
 * on the same screen waits for it rather than appending alongside it.
 */
function BusyMirror({ reportId }: { reportId: string }) {
  const { pending } = useFormStatus();
  useEffect(() => {
    setCaptureBusy(reportId, pending);
    return () => setCaptureBusy(reportId, false);
  }, [pending, reportId]);
  return null;
}

/**
 * One capture, added to the day's report.
 *
 * The box holds only what is being said now. Everything captured earlier stays
 * on the server and is never posted back, so this screen has nothing to
 * overwrite even if it has been sitting open on a phone in a van since eight
 * o'clock - see addCapture.
 *
 * The text lives in lib/capture-draft.ts, not here: that is what keeps it on
 * the phone through a failed request or a discarded tab, and what lets Prepare
 * Daily at the bottom of the screen add whatever is still in the box before it
 * writes. The box is emptied only when the server has confirmed the capture.
 */
export function SiteCaptureForm({
  action,
  reportId,
}: {
  action: (state: CaptureState, formData: FormData) => Promise<CaptureState>;
  reportId: string;
}) {
  const [state, formAction] = useRecoverableActionState<CaptureState, FormData>(action, {});
  const capturedAt = useRef<HTMLInputElement>(null);

  /**
   * What is in the box: anything typed or spoken, and anything a failed
   * request or a discarded tab left on this phone.
   *
   * Read through the store rather than in an effect: the server snapshot is
   * empty, the client picks the text up straight after hydration, and no state
   * is written on mount. See lib/capture-draft.ts.
   */
  const text = useSyncExternalStore(
    subscribeToCaptureDraft,
    () => readCaptureDraft(reportId),
    () => "",
  );
  const busy = useSyncExternalStore(
    subscribeToCaptureDraft,
    () => readCaptureBusy(reportId),
    () => false,
  );

  /**
   * The server has it. Only now may the local copy go - and clearing it is
   * what empties the box. Keyed on the result itself, so a second identical
   * note (which the server answers "already saved") clears the box too.
   */
  const landed = !state.error && state.savedAt !== undefined;
  useEffect(() => {
    if (landed) clearCaptureDraft(reportId);
  }, [state, landed, reportId]);

  return (
    <form
      action={formAction}
      // The clock on the phone in somebody's hand, not the server's. A capture
      // made at 08:14 on a British site should read 08:14 whatever timezone the
      // database happens to be in.
      onSubmit={() => {
        if (capturedAt.current) capturedAt.current.value = clockNow();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="captured_at" ref={capturedAt} />
      <BusyMirror reportId={reportId} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <DictationField
        composer
        name="capture_text"
        label="What happened on site?"
        value={text}
        onValueChange={(value) => writeCaptureDraft(reportId, value)}
        rows={3}
        disabled={busy}
        startLabel="Speak"
        stopLabel="Stop"
        placeholder="Tap the mic and talk, or type here. What got done, who was here, deliveries, hold-ups."
      />

      <div className="min-h-4 px-1">
        <SaveStatus savedAt={state.error ? undefined : state.savedAt} failed={Boolean(state.error)} />
      </div>
    </form>
  );
}
