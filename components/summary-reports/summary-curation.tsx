"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ImageOff } from "lucide-react";

import { saveSummaryCuration, type SummaryFormState } from "@/app/(app)/summary-reports/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS } from "@/lib/issues/metadata";
import { PHOTO_CATEGORY_LABELS } from "@/lib/photos";
import type { IssuePriority, IssueStatus, PhotoCategory } from "@/types/database";

export type CuratedPhotoChoice = {
  id: string;
  caption: string | null;
  category: PhotoCategory;
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
}: {
  reportId: string;
  photos: CuratedPhotoChoice[];
  issues: CuratedIssueChoice[];
}) {
  const save = saveSummaryCuration.bind(null, reportId);
  const [state, action] = useActionState<SummaryFormState, FormData>(save, {});
  return (
    <form action={action} className="flex flex-col gap-6 border-t border-line pt-6">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">What the client sees</h2>
        <p className="mt-1 text-sm text-ink-muted">Choose the photographs and issues included in this document.</p>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Selection saved.</Alert> : null}

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
                  <input type="checkbox" name="photoId" value={photo.id} defaultChecked={photo.selected} className="mt-1 size-5 accent-black" />
                  <span className="min-w-0">
                    <span className="block font-medium">{PHOTO_CATEGORY_LABELS[photo.category]}</span>
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

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold text-ink">Issues</legend>
        {issues.length === 0 ? (
          <p className="text-sm text-ink-muted">No project issues are available.</p>
        ) : (
          issues.map((issue) => (
            <label key={issue.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
              <input type="checkbox" name="issueId" value={issue.id} defaultChecked={issue.selected} className="mt-1 size-5 shrink-0 accent-black" />
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
