"use client";

import { Check, ImageOff } from "lucide-react";

import {
  PDF_STYLES,
  PDF_STYLE_DESCRIPTIONS,
  PDF_STYLE_LABELS,
  describePresentation,
  type PdfStyle,
} from "@/lib/pdf/presentation";
import { cn } from "@/lib/utils";

export type CoverChoice = {
  id: string;
  url: string | null;
  /** What the photograph is of, for the picker and for its alt text. */
  label: string | null;
};

/**
 * How this report will be presented when it is issued: which of the three
 * styles, and whether it opens on a photograph.
 *
 * Both choices are made here and carried into the render - as hidden fields on
 * the finalise form and as query parameters on the preview link - so what the
 * preview shows is what gets issued. Neither is stored: the issued PDF is the
 * record, and the choice lives inside it. That is also why no migration was
 * needed for any of this.
 *
 * The cover is offered from the photographs this report already prints, so
 * choosing one copies, uploads and stores nothing.
 *
 * Deliberately three fixed styles and no more. A colour picker would let one
 * contractor issue documents that look like they came from three different
 * companies.
 */
export function PdfPresentation({
  style,
  onStyle,
  cover,
  onCover,
  photos,
}: {
  style: PdfStyle;
  onStyle: (style: PdfStyle) => void;
  cover: string | null;
  onCover: (id: string | null) => void;
  photos: CoverChoice[];
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line p-3">
      <div>
        <h3 className="font-medium text-ink">Presentation</h3>
        <p className="mt-1 text-sm text-ink-muted">
          {describePresentation({ style, hasCover: Boolean(cover), photoCount: photos.length })}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">PDF style</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PDF_STYLES.map((key) => {
            const active = key === style;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => onStyle(key)}
                className={cn(
                  "flex min-h-(--ui-control-min) flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                  active
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{PDF_STYLE_LABELS[key]}</span>
                  {active ? <Check className="size-4 shrink-0 text-brand-ink" aria-hidden /> : null}
                </span>
                <span className="text-xs text-ink-muted">{PDF_STYLE_DESCRIPTIONS[key]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* A report with no photographs has no cover to offer, and saying so in
          the line above is enough - an empty picker would only be a puzzle. */}
      {photos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">Cover photo</p>
          {/* Scrolls sideways rather than wrapping into a wall of thumbnails
              on a phone. */}
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <li>
              <button
                type="button"
                aria-pressed={cover === null}
                onClick={() => onCover(null)}
                className={cn(
                  "flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-xs",
                  cover === null
                    ? "border-brand bg-brand-soft text-ink"
                    : "border-line bg-surface text-ink-muted hover:border-line-strong",
                )}
              >
                <ImageOff className="size-5" aria-hidden />
                None
              </button>
            </li>
            {photos.map((photo) => {
              const active = photo.id === cover;
              return (
                <li key={photo.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    title={photo.label ?? "Site photograph"}
                    onClick={() => onCover(active ? null : photo.id)}
                    className={cn(
                      "relative size-20 shrink-0 overflow-hidden rounded-xl border bg-surface-muted",
                      active ? "border-brand ring-2 ring-brand" : "border-line",
                    )}
                  >
                    {photo.url ? (
                      // Signed Supabase URLs expire, so next/image's optimiser
                      // would cache a link that is already dead.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.url}
                        alt={photo.label ?? "Site photograph"}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-xs text-ink-subtle">
                        No preview
                      </span>
                    )}
                    {active ? (
                      <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-brand text-ink-inverse">
                        <Check className="size-3" aria-hidden />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
