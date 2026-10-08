"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowUp, Mic, Square } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechInput } from "@/lib/hooks/use-speech-input";
import { joinTranscript } from "@/lib/speech/transcript";
import { cn } from "@/lib/utils";

/** The composer grows with what is said, up to about eleven lines. */
const COMPOSER_MAX_HEIGHT_PX = 288;

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
  composer = false,
  disabled = false,
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
   * The microphone as the full width of the phone rather than a button sitting
   * beside a textarea. Same component, same hook, same transcript joining -
   * only the size of the control changes.
   */
  prominent?: boolean;
  /**
   * Site Capture: one box with the microphone and a send arrow inside it,
   * the way a message is written. The arrow submits the form this sits in,
   * and is dead while there is nothing to send or a send is on its way.
   */
  composer?: boolean;
  /** Composer only: another request on this report is in flight. */
  disabled?: boolean;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const controlled = value !== undefined;
  const text = controlled ? value : own;

  // The latest text, whoever owns it. Dictated chunks can arrive faster than
  // React re-renders, and every one must build on the last - not on whatever
  // the previous render's props or state happened to hold. Set the moment the
  // text changes here, and brought back in line after a render where the
  // owner changed it (a landed capture emptying the box).
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  }, [text]);

  const setText = (next: string) => {
    latest.current = next;
    if (!controlled) setOwn(next);
    onValueChange?.(next);
  };

  const { supported, listening, error, start, stop } = useSpeechInput({
    // Through setText, the same as a keystroke: a spoken chunk reaches the
    // caller's onValueChange, which on Site Capture is what keeps the words
    // on the phone. Dictation used to bypass it, and a tab iOS discarded
    // mid-sentence lost everything spoken.
    onText: (chunk) => setText(joinTranscript(latest.current, chunk)),
  });

  if (composer) {
    return (
      <Composer
        name={name}
        label={label}
        text={text}
        setText={setText}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        dictation={{ supported, listening, error, start, stop, startLabel, stopLabel }}
      />
    );
  }

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
            className={prominent ? "h-16 w-full text-lg font-bold" : undefined}
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

/**
 * The send arrow. Dead with nothing to send, dead while a send is on its way.
 *
 * `useFormStatus` reads the form this sits in, so a double tap on one bar of
 * signal is one request - and addCapture refuses a repeat of the entry it
 * already wrote, so neither the finger nor the network can double it.
 */
function SendButton({ empty, disabled }: { empty: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={pending ? "Adding your note" : "Add note"}
      disabled={empty || pending || disabled}
      data-composer-send
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full bg-brand text-ink-inverse shadow-glow transition-[transform,opacity,filter] duration-200 ease-out active:scale-95",
        "disabled:pointer-events-none disabled:opacity-35 disabled:shadow-none",
      )}
    >
      {pending ? (
        <span className="size-5 animate-spin rounded-full border-2 border-ink-inverse/30 border-t-ink-inverse" aria-hidden />
      ) : (
        <ArrowUp aria-hidden className="size-5" strokeWidth={2.5} />
      )}
    </button>
  );
}

/**
 * One box: the words, the microphone and the arrow, the way a message is sent.
 *
 * The box grows with what is said rather than scrolling inside itself, up to
 * a height that still leaves the phone's keyboard room, and the controls sit
 * inside its bottom edge so the thumb never leaves it.
 */
function Composer({
  name,
  label,
  text,
  setText,
  placeholder,
  rows,
  disabled,
  dictation,
}: {
  name: string;
  label: string;
  text: string;
  setText: (next: string) => void;
  placeholder: string;
  rows: number;
  disabled: boolean;
  dictation: {
    supported: boolean;
    listening: boolean;
    error: string | null;
    start: () => void;
    stop: () => void;
    startLabel: string;
    stopLabel: string;
  };
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    // Measured from the content, so a dictated paragraph opens at its own
    // height rather than at three lines with the rest hidden.
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, []);

  useEffect(grow, [grow, text]);

  const { supported, listening, error, start, stop, startLabel, stopLabel } = dictation;

  return (
    <div className="flex flex-col gap-2">
      <div
        data-composer
        className={cn(
          "relative rounded-card bg-surface-sunken/70 shadow-[inset_0_1px_0_0_rgb(0_0_0/0.25)] ring-1 ring-line-strong/70 ring-inset transition-[box-shadow,ring-color] duration-200",
          "focus-within:ring-2 focus-within:ring-brand/60",
          listening && "ring-danger/50",
        )}
      >
        <Textarea
          ref={ref}
          id={name}
          name={name}
          aria-label={label}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onInput={grow}
          rows={rows}
          placeholder={placeholder}
          autoCapitalize="sentences"
          // No `text-base`: the global floor of max(16px, 1rem) applies, so
          // iOS never zooms in on this box - even with Small text chosen.
          // Bottom padding is the row the controls sit in.
          className="min-h-0 resize-none border-0 bg-transparent px-4 pt-3 pb-16 shadow-none ring-0 focus:border-0 focus:ring-0"
        />

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-3">
          {supported ? (
            <button
              type="button"
              onClick={listening ? stop : start}
              aria-pressed={listening}
              aria-label={listening ? stopLabel : startLabel}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-200 active:scale-95",
                listening
                  ? "bg-danger-strong text-white"
                  : "bg-surface-raised text-ink ring-1 ring-line-strong/80 ring-inset hover:bg-surface-muted",
              )}
            >
              {listening ? <Square aria-hidden className="size-5" /> : <Mic aria-hidden className="size-5" />}
            </button>
          ) : null}

          <span className="min-w-0 flex-1 truncate text-xs text-ink-subtle">
            {listening ? (
              <span className="flex items-center gap-2 font-semibold text-ink-muted">
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden />
                Listening - keeps going while you pause
              </span>
            ) : supported ? null : (
              // iOS Safari without the API: the keyboard microphone types into
              // this same box, so the workflow is intact.
              "Use the microphone on your keyboard to speak."
            )}
          </span>

          <SendButton empty={!text.trim()} disabled={disabled} />
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
