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
/** Matches leading-6 below; keep the six-line cap aligned with the text. */
const LINE_HEIGHT_PX = 24;
const PADDING_PX = 16;

export function PhotoDescriptionField({
  id,
  name,
  value,
  onChange,
  onBlur,
  label = "Caption (optional)",
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
    const styles = window.getComputedStyle(element);
    const lineHeight = parseFloat(styles.lineHeight) || LINE_HEIGHT_PX;
    const padding = (parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)) || PADDING_PX;
    const max = MAX_ROWS * lineHeight + padding;
    element.style.height = `${Math.min(element.scrollHeight, max)}px`;
  }, []);

  useEffect(grow, [grow, value]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-1 text-xs">
        <label htmlFor={id} className="font-semibold text-ink-muted">{label}</label>
        <span id={`${id}-hint`} className="text-ink-subtle">Short and factual</span>
      </div>
      <textarea
        ref={ref}
        id={id}
        name={name}
        aria-describedby={`${id}-hint`}
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
        className="w-full resize-none rounded-control bg-surface-sunken/70 px-3 py-2 text-[length:max(16px,1rem)] leading-6 break-words whitespace-pre-wrap text-ink ring-1 ring-line-strong/60 ring-inset transition-[box-shadow] duration-200 placeholder:text-ink-subtle focus:ring-2 focus:ring-brand/60 focus:outline-none"
      />
    </div>
  );
}
