"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";

import type { CaptureState } from "@/app/(app)/reports/capture-actions";
import { DictationField } from "@/components/reports/dictation-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-14 w-full text-base" loading={pending}>
      {pending ? "Adding…" : "Add to today's report"}
    </Button>
  );
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
}: {
  action: (state: CaptureState, formData: FormData) => Promise<CaptureState>;
  entryCount: number;
}) {
  const [state, formAction] = useActionState<CaptureState, FormData>(action, {});
  const capturedAt = useRef<HTMLInputElement>(null);

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
        key={entryCount}
        name="capture_text"
        label="What has happened on site"
        defaultValue=""
        rows={8}
        prominent
        placeholder="Say what has happened since you were last here. Trades on site, what got done, deliveries, hold-ups, anything the client should know."
      />

      <SaveButton />
    </form>
  );
}
