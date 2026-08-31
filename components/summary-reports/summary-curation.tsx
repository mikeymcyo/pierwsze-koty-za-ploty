"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ImageOff } from "lucide-react";

import { saveSummaryCuration, type SummaryFormState } from "@/app/(app)/summary-reports/actions";
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

function SaveButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending}>{pending ? "Saving selection…" : "Save selection"}</Button>;
}

export function SummaryCuration({
  reportId,
  photos,
  issues,
  showPhotos = true,
}: {
  reportId: string;
  photos: CuratedPhotoChoice[];
  issues: CuratedIssueChoice[];
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
  return (
    <form action={action} className="flex flex-col gap-6">
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
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
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
                      onChange={(event) =>
                        setIncluded((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(photo.id);
                          else next.delete(photo.id);
                          return next;
                        })
                      }
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
                    <PhotoDescriptionField
                      id={`photoCaption_${photo.id}`}
                      name={`photoCaption_${photo.id}`}
                      defaultValue={photo.captionOverride ?? photo.caption ?? ""}
                      label="Photo description (optional)"
                      placeholder="What does this show, in this report?"
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
              <input type="checkbox" name="issueId" value={issue.id} defaultChecked={issue.selected} className="mt-1 size-5 shrink-0 accent-brand" />
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
      <SaveButton />
    </form>
  );
}
