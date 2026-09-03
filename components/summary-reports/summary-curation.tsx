"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { ImageOff, RotateCw, Sparkles } from "lucide-react";

import { saveSummaryCuration, type SummaryFormState } from "@/app/(app)/summary-reports/actions";
import { describePhotoAction } from "@/app/(app)/reports/photo-actions";
import { PhotoDescriptionField } from "@/components/reports/photo-description-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS } from "@/lib/issues/metadata";
import { photoStatusLabel } from "@/lib/photo-captions";
import type { IssuePriority, IssueStatus, PhotoCategory } from "@/types/database";

export type CuratedPhotoChoice = {
  id: string;
  caption: string | null;
  category: PhotoCategory;
  /** Quarter turns applied while drawing. Absent means as uploaded. */
  rotation?: number | null;
  url: string | null;
  selected: boolean;
  captionOverride: string | null;
};

export type CuratedIssueChoice = {
  id: string;
  title: string;
  priority: IssuePriority;
  status: IssueStatus;
  resolution: string | null;
  selected: boolean;
};

function SaveButton({ retry }: { retry: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      loading={pending}
      // Dead for the round trip. The save reconciles rather than rewrites, so a
      // second submission would be harmless - but a button that still looks
      // pressable is a button somebody presses again wondering if it worked.
      disabled={pending}
    >
      {retry && !pending ? <RotateCw aria-hidden /> : null}
      {pending ? "Saving selection…" : retry ? "Try again" : "Save selection"}
    </Button>
  );
}

/**
 * The description printed under one plate in this report, and the button that
 * drafts it.
 *
 * A component of its own because the text has to be state rather than a
 * defaultValue: the model's sentence goes straight into the box the user is
 * looking at, so it can be corrected there and then. On a Completion Report
 * this is the only place a plate is described, and it had no help at all -
 * every other screen in the application offers it.
 *
 * Deliberately not the suggestion panel used under a photograph's own
 * thumbnail. Nothing here is written until Save selection is pressed, so the
 * sentence in the box is already a draft: a second Use it step would be a step
 * that decides nothing. Pressing again redrafts, and the box is a textarea
 * throughout - what is in it when the form saves is what prints.
 */
function PhotoDescription({
  photoId,
  value,
  onChange,
  aiConfigured,
}: {
  photoId: string;
  value: string;
  onChange: (value: string) => void;
  aiConfigured: boolean;
}) {
  const [drafting, startDrafting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function draft() {
    setError(null);
    startDrafting(async () => {
      const result = await describePhotoAction(photoId, {}, new FormData());
      if (result.description) onChange(result.description);
      else setError(result.error ?? "That description could not be written.");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <PhotoDescriptionField
        id={`photoCaption_${photoId}`}
        name={`photoCaption_${photoId}`}
        value={value}
        onChange={onChange}
        label="Photo description (optional)"
        placeholder="What does this show, in this report?"
      />
      {aiConfigured ? (
        <Button
          // A button, not a submit: this sits inside the curation form, and a
          // form cannot be nested inside another one.
          type="button"
          size="sm"
          variant="ghost"
          loading={drafting}
          onClick={draft}
          // Full width, and tighter than the default small button: in a
          // two-column tile there is no room for a label beside a left-aligned
          // button, and a wide target is the easier one to hit with a glove
          // on. The narrower padding is what keeps the label on one line on an
          // iPhone SE - measured, not guessed.
          className="w-full gap-1.5 px-2"
        >
          {drafting ? null : <Sparkles aria-hidden />}
          {drafting ? "Looking…" : value.trim() ? "Describe again" : "Describe with AI"}
        </Button>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function SummaryCuration({
  reportId,
  photos,
  issues,
  showPhotos = true,
  aiConfigured = false,
}: {
  reportId: string;
  photos: CuratedPhotoChoice[];
  issues: CuratedIssueChoice[];
  /** Whether the AI draft is offered - hidden with no key configured. */
  aiConfigured?: boolean;
  /**
   * False on a survey, which manages its photographs in place - taking them,
   * captioning them and removing them without leaving the document. Two photo
   * pickers on one screen, each saving through a different action, would be a
   * way to lose a caption.
   */
  showPhotos?: boolean;
}) {
  const save = saveSummaryCuration.bind(null, reportId);
  const [state, action] = useActionState<SummaryFormState, FormData>(save, {});
  /**
   * Which photographs are in the document, tracked here rather than left to
   * the DOM.
   *
   * A caption box used to sit under every photograph on the project, whether or
   * not it was ticked. Somebody captioned twelve of them, six were not in the
   * report, and those six captions went nowhere - which read as a second set of
   * photographs that would not export. A caption belongs to a photograph that
   * is in the document, so the box appears with the tick and goes with it.
   */
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(photos.filter((photo) => photo.selected).map((photo) => photo.id)),
  );

  /**
   * What each ticked photograph will print under it.
   *
   * Held here rather than left to the DOM because the AI draft has to land in
   * the box the user is looking at. Seeded from the report's own caption where
   * one was written, the photograph's own otherwise - the same fallback the PDF
   * uses, so the screen and the document start from the same words.
   */
  const [descriptions, setDescriptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      photos.map((photo) => [photo.id, photo.captionOverride ?? photo.caption ?? ""]),
    ),
  );

  /**
   * Ticks moved, or a description typed, and not yet saved.
   *
   * There is no queue behind this form - it is a request like any other - so
   * the honest thing to do about a phone walking away with an unsaved
   * selection is to ask first. Cleared the moment the server confirms.
   */
  const [touched, setTouched] = useState(false);
  // Derived rather than reset in an effect: submitting clears it in the submit
  // handler, and a save that came back with an error puts it straight back -
  // which is exactly when leaving would lose something.
  const dirty = touched || Boolean(state.error);
  const setDirty = setTouched;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form action={action} onSubmit={() => setTouched(false)} className="flex flex-col gap-6">
      <div>
        {/* An h3: the report's three section headings are the h2s on this
            screen now, and this control sits under one of them. */}
        <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">What the client sees</h3>
        <p className="mt-1 text-sm text-ink-muted">
          {showPhotos
            ? "Tick the photographs this document includes - those, and only those, are printed. A ticked photograph can carry a caption written for this report. Their order is set in Arrange Photos above and is not changed by saving here."
            : "Choose the issues included in this document."}
        </p>
      </div>
      {state.error ? (
        <Alert tone="danger">
          {state.error} Nothing was lost - your ticks and descriptions are still on this screen.
          Press Try again.
        </Alert>
      ) : null}
      {state.saved ? <Alert tone="success">Selection saved.</Alert> : null}

      {/* Tells the action this form carried a photograph selection at all. A
          survey manages its own photographs, so its form must not be read as
          "no photographs selected" and empty the report. */}
      {showPhotos ? <input type="hidden" name="photosIncluded" value="1" /> : null}

      {showPhotos ? (
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold text-ink">Photographs</legend>
        {photos.length === 0 ? (
          <p className="text-sm text-ink-muted">No project photographs are available.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => {
              const inReport = included.has(photo.id);
              return (
                // A div, not a label: the description box lives in this tile,
                // and a textarea inside a label toggles the checkbox when it is
                // tapped. Only the picture and the tick are the label now.
                <div
                  key={photo.id}
                  className={`flex flex-col gap-2 rounded-xl border p-2 transition-colors ${
                    inReport ? "border-brand bg-brand-soft" : "border-line"
                  }`}
                >
                  <label className="flex cursor-pointer flex-col gap-2">
                  <div className="aspect-square overflow-hidden rounded-lg bg-surface-muted">
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.url} alt={photo.caption ?? "Site photograph"} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center"><ImageOff className="size-6 text-ink-subtle" aria-hidden /></span>
                    )}
                  </div>
                  <span className="flex items-start gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="photoId"
                      value={photo.id}
                      checked={inReport}
                      onChange={(event) => {
                        setDirty(true);
                        setIncluded((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(photo.id);
                          else next.delete(photo.id);
                          return next;
                        });
                      }}
                      className="mt-1 size-5 accent-brand"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{photoStatusLabel(photo.category) ?? "Photograph"}</span>
                      {photo.caption ? <span className="block truncate text-xs text-ink-muted">{photo.caption}</span> : null}
                    </span>
                  </span>
                  </label>
                  {/* Only on a photograph that is actually in the document.
                      A caption on one that is not would never print. */}
                  {inReport ? (
                    // The same box as the one under a photograph's own
                    // thumbnail. A one-line input scrolled a sentence sideways
                    // out of sight while it was being typed.
                    <PhotoDescription
                      photoId={photo.id}
                      // Falls back to the photograph's own words rather than to
                      // nothing: the state is seeded at mount, so a photograph
                      // that arrives after one would otherwise show an empty
                      // box over a caption that is really there.
                      value={
                        descriptions[photo.id] ??
                        photo.captionOverride ??
                        photo.caption ??
                        ""
                      }
                      onChange={(text) => {
                        setDirty(true);
                        setDescriptions((current) => ({ ...current, [photo.id]: text }));
                      }}
                      aiConfigured={aiConfigured}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold text-ink">Issues</legend>
        {issues.length === 0 ? (
          <p className="text-sm text-ink-muted">No project issues are available.</p>
        ) : (
          issues.map((issue) => (
            <label key={issue.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
              <input
                type="checkbox"
                name="issueId"
                value={issue.id}
                defaultChecked={issue.selected}
                onChange={() => setDirty(true)}
                className="mt-1 size-5 shrink-0 accent-brand"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{issue.title}</span>
                <span className="mt-1 flex flex-wrap gap-2">
                  <Badge tone="neutral">{ISSUE_PRIORITY_LABELS[issue.priority]}</Badge>
                  <Badge tone={issue.status === "closed" ? "success" : "info"}>{ISSUE_STATUS_LABELS[issue.status]}</Badge>
                </span>
                {issue.resolution ? <span className="mt-2 block text-sm text-ink-muted">Resolution: {issue.resolution}</span> : null}
              </span>
            </label>
          ))
        )}
      </fieldset>
      <SaveButton retry={Boolean(state.error)} />
    </form>
  );
}
