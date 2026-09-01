"use client";

import { useState } from "react";
import { Mic, Square } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechInput } from "@/lib/hooks/use-speech-input";
import { joinTranscript } from "@/lib/speech/transcript";

/**
 * Anything written on site, spoken or typed.
 *
 * The day's notes, where whatever ends up here is stored verbatim in
 * reports.raw_notes and is never overwritten by the AI drafting - the user must
 * always be able to see what they actually said next to what was written for
 * them. And the write-up box of a report's visible section, which is why the
 * height and the placeholder are arguments: a Progress Report gets the same
 * microphone as a Daily Report rather than a second implementation of one.
 */
export function DictationField({
  name,
  label,
  defaultValue,
  rows = 10,
  placeholder = "Describe the day's work in your own words. Trades on site, what got done, deliveries, delays, anything the client should know.",
  prominent = false,
  value,
  onValueChange,
  startLabel = "Dictate",
  stopLabel = "Stop dictating",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  /**
   * Where the caller owns the text.
   *
   * Site Capture does, because the words have to survive a failed request:
   * they are kept on the phone until the server confirms the capture, which
   * this component cannot know about. Everywhere else leaves it uncontrolled
   * and passes defaultValue, exactly as before.
   */
  value?: string;
  onValueChange?: (value: string) => void;
  /** What the microphone button says. Site Capture says Speak. */
  startLabel?: string;
  stopLabel?: string;
  /** Shorter where the box is one of several on a screen. */
  rows?: number;
  placeholder?: string;
  /**
   * Site Capture is a screen somebody opens to speak and nothing else, so the
   * microphone is the full width of the phone there rather than a button
   * sitting beside a textarea. Same component, same hook, same transcript
   * joining - only the size of the control changes.
   */
  prominent?: boolean;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const controlled = value !== undefined;
  const text = controlled ? value : own;
  const setText = (next: string) => {
    if (!controlled) setOwn(next);
    onValueChange?.(next);
  };

  const { supported, listening, error, start, stop } = useSpeechInput({
    // The functional form matters: chunks can arrive faster than React
    // re-renders, and each one must build on the last rather than on whatever
    // this closure captured.
    // The functional form matters where this component owns the text: chunks
    // can arrive faster than React re-renders. Where the caller owns it, the
    // latest value is the one in props.
    onText: (chunk) => {
      if (controlled) setText(joinTranscript(value ?? "", chunk));
      else setOwn((current) => joinTranscript(current, chunk));
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        id={name}
        name={name}
        // The section heading above says "Work completed", so a second visible
        // label would just be noise - but the field still needs a name of its
        // own for screen readers and for tests to find it by.
        aria-label={label}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="text-base"
      />

      {supported ? (
        <div
          className={
            prominent
              ? "flex flex-col items-stretch gap-3"
              : "flex flex-wrap items-center gap-3"
          }
        >
          <Button
            type="button"
            variant={listening ? "danger" : prominent ? "primary" : "secondary"}
            size="lg"
            onClick={listening ? stop : start}
            aria-pressed={listening}
            className={prominent ? "h-16 w-full text-base" : undefined}
          >
            {listening ? <Square aria-hidden /> : <Mic aria-hidden />}
            {listening ? stopLabel : startLabel}
          </Button>

          {listening ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
              Listening - speak normally, it keeps going while you pause
            </span>
          ) : null}
        </div>
      ) : (
        // iOS Safari is the main case. The keyboard microphone types into this
        // same box, so the workflow is intact - say so rather than showing a
        // button that would do nothing.
        <p className="text-sm text-ink-muted">
          Dictation is not available in this browser. Tap the microphone on your
          keyboard instead - it types straight into the box above.
        </p>
      )}

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
