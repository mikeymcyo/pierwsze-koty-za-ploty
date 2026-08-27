"use client";

import { useState } from "react";
import { Mic, Square } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechInput } from "@/lib/hooks/use-speech-input";

/**
 * The day's work, spoken or typed.
 *
 * Whatever ends up here is stored verbatim in reports.raw_notes and is never
 * overwritten by the AI drafting in a later phase - the user must always be able
 * to see what they actually said next to what was written for them.
 */
export function DictationField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);

  const { supported, listening, error, start, stop } = useSpeechInput({
    onText: (text) =>
      setValue((current) => (current.trim() ? `${current.trim()} ${text}` : text)),
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
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={10}
        placeholder="Describe the day's work in your own words. Trades on site, what got done, deliveries, delays, anything the client should know."
        className="text-base"
      />

      {supported ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={listening ? "danger" : "secondary"}
            size="lg"
            onClick={listening ? stop : start}
            aria-pressed={listening}
          >
            {listening ? <Square aria-hidden /> : <Mic aria-hidden />}
            {listening ? "Stop dictating" : "Dictate"}
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
