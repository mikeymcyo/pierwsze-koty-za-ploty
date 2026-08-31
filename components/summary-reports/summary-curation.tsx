"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ImageOff } from "lucide-react";

import { saveSummaryCuration, type SummaryFormState } from "@/app/(app)/summary-reports/actions";
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
  return (
    <form action={action} className="flex flex-col gap-6">
      <div>
        {/* An h3: the report's three section headings are the h2s on this
            screen now, and this control sits under one of them. */}
        <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">What the client sees</h3>
        <p className="mt-1 text-sm text-ink-muted">
          {showPhotos
            ? "Choose the photographs and issues included in this document."
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
            {photos.map((photo) => (
              <label key={photo.id} className="flex cursor-pointer flex-col gap-2 rounded-xl border border-line p-2">
                <div className="aspect-square overflow-hidden rounded-lg bg-surface-muted">
                  {photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt={photo.caption ?? "Site photograph"} className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center"><ImageOff className="size-6 text-ink-subtle" aria-hidden /></span>
                  )}
                </div>
                <span className="flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" name="photoId" value={photo.id} defaultChecked={photo.selected} className="mt-1 size-5 accent-brand" />
                  <span className="min-w-0">
                    <span className="block font-medium">{photoStatusLabel(photo.category) ?? "Photograph"}</span>
                    {photo.caption ? <span className="block truncate text-xs text-ink-muted">{photo.caption}</span> : null}
                  </span>
                </span>
                <input
                  type="text"
                  name={`photoCaption_${photo.id}`}
                  defaultValue={photo.captionOverride ?? photo.caption ?? ""}
                  placeholder="Caption in this report"
                  className="min-h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink"
                  aria-label={`Report caption for ${photo.caption ?? "site photograph"}`}
                />
              </label>
            ))}
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
