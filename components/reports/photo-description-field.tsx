"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The box a photograph is described in.
 *
 * One component wherever a description is typed - the photograph's own, under
 * its thumbnail, and the caption written for one consolidated report - because
 * a site manager who learns the box on one screen should meet the same box on
 * the other. A single-line input was the wrong shape for both: a description
 * worth printing under a plate is a sentence, and a sentence in a one-line box
 * scrolls sideways out of sight while it is being typed.
 *
 * Three lines to start, growing to six as it fills, and no further: past that
 * it scrolls, because a description longer than six lines is not a caption and
 * a box that keeps growing pushes the photograph it belongs to off the screen.
 */
const MIN_ROWS = 3;
const MAX_ROWS = 6;
/** Matches the `text-sm` line box, near enough for a height cap. */
const LINE_HEIGHT_PX = 20;
const PADDING_PX = 16;

export function PhotoDescriptionField({
  id,
  name,
  value,
  onChange,
  onBlur,
  label = "Photo description (optional)",
  placeholder = "What does this show?",
  maxLength = 300,
  defaultValue,
}: {
  id: string;
  name: string;
  /** Controlled where the caller owns the text; otherwise pass defaultValue. */
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  defaultValue?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    // Measured from the content, so a pasted paragraph opens at the right
    // height rather than at three lines with the rest hidden.
    element.style.height = "auto";
    const max = MAX_ROWS * LINE_HEIGHT_PX + PADDING_PX;
    element.style.height = `${Math.min(element.scrollHeight, max)}px`;
  }, []);

  useEffect(grow, [grow, value]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-ink-muted">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          onChange?.(event.target.value);
          grow();
        }}
        onBlur={onBlur}
        onInput={grow}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={MIN_ROWS}
        // Wrapping is the default, but it is the point of this box, so it is
        // written down rather than assumed.
        wrap="soft"
        className="w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm leading-5 break-words whitespace-pre-wrap text-ink placeholder:text-ink-subtle"
      />
    </div>
  );
}
