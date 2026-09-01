"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, RotateCw } from "lucide-react";

import type { CaptureState } from "@/app/(app)/reports/capture-actions";
import { DictationField } from "@/components/reports/dictation-field";
import { Alert } from "@/components/ui/alert";
import {
  clearCaptureDraft,
  readCaptureDraft,
  subscribeToCaptureDraft,
  writeCaptureDraft,
} from "@/lib/capture-draft";
import { Button } from "@/components/ui/button";

function SaveButton({ retry }: { retry: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="h-14 w-full text-base"
      loading={pending}
      // Two taps on one bar of signal used to be two entries. The button goes
      // dead for the round trip, and addCapture refuses a repeat of the entry
      // it already wrote, so neither the finger nor the network can double it.
      disabled={pending}
    >
      {pending ? (
        "Adding…"
      ) : retry ? (
        <>
          <RotateCw aria-hidden />
          Try again
        </>
      ) : (
        "Add note"
      )}
    </Button>
  );
}

/** Saving… / Saved / nothing. Never "saved" before the server says so. */
function SaveStatus({ savedAt, failed }: { savedAt?: string; failed: boolean }) {
  const { pending } = useFormStatus();
  if (pending) return <span className="text-xs text-ink-subtle">Saving…</span>;
  if (failed) return <span className="text-xs text-danger">Not saved - your words are safe here</span>;
  if (savedAt !== undefined) {
    return (
      <span className="flex items-center gap-1 text-xs text-ink-muted">
        <Check aria-hidden className="size-3.5" />
        Saved{savedAt ? ` at ${savedAt}` : ""}
      </span>
    );
  }
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
 * `entryCount` is what clears the box. It comes from the server and only
 * changes when a capture actually landed, so a successful save starts a fresh
 * transcript and a failed one leaves every word where the user left it.
 */
export function SiteCaptureForm({
  action,
  entryCount,
  reportId,
}: {
  action: (state: CaptureState, formData: FormData) => Promise<CaptureState>;
  entryCount: number;
  reportId: string;
}) {
  const [state, formAction] = useActionState<CaptureState, FormData>(action, {});
  const capturedAt = useRef<HTMLInputElement>(null);

  /**
   * Anything a failed request or a discarded tab left on this phone.
   *
   * Read through the store rather than in an effect: the server snapshot is
   * empty, the client picks the text up straight after hydration, and no state
   * is written on mount. See lib/capture-draft.ts.
   */
  const restored = useSyncExternalStore(
    subscribeToCaptureDraft,
    () => readCaptureDraft(reportId),
    () => "",
  );

  /**
   * The server has it. Only now may the local copy go - and clearing it is
   * what empties the box, because the field is keyed on it.
   */
  const landed = !state.error && state.savedAt !== undefined;
  useEffect(() => {
    if (landed) clearCaptureDraft(reportId);
  }, [landed, entryCount, reportId]);

  return (
    <form
      action={formAction}
      // The clock on the phone in somebody's hand, not the server's. A capture
      // made at 08:14 on a British site should read 08:14 whatever timezone the
      // database happens to be in.
      onSubmit={() => {
        if (!capturedAt.current) return;
        const now = new Date();
        capturedAt.current.value = `${String(now.getHours()).padStart(2, "0")}:${String(
          now.getMinutes(),
        ).padStart(2, "0")}`;
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="captured_at" ref={capturedAt} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {restored && !landed ? (
        <Alert tone="info">
          Words you had not added yet were still on this phone. They are back in the box - add
          them when you are ready.
        </Alert>
      ) : null}
      {!state.error && state.savedAt !== undefined ? (
        <Alert tone="success">
          <span className="flex items-center gap-2">
            <Check aria-hidden className="size-4 shrink-0" />
            Added{state.savedAt ? ` at ${state.savedAt}` : ""}. Come back any time - it all
            goes on the same report.
          </span>
        </Alert>
      ) : null}

      <DictationField
        // Keyed on the stored draft, so the box is rebuilt when the phone hands
        // one back after hydration and again - empty - the moment a capture
        // lands. A failed save changes neither, so every word stays put.
        key={`${entryCount}:${restored.length}`}
        name="capture_text"
        label="What happened on site?"
        defaultValue={restored}
        onValueChange={(value) => writeCaptureDraft(reportId, value)}
        rows={8}
        prominent
        startLabel="Speak"
        stopLabel="Stop"
        placeholder="Tap the mic and talk, or type here. What got done, who was here, deliveries, hold-ups."
      />

      <SaveButton retry={Boolean(state.error)} />
      <div className="min-h-4">
        <SaveStatus savedAt={state.error ? undefined : state.savedAt} failed={Boolean(state.error)} />
      </div>
    </form>
  );
}
