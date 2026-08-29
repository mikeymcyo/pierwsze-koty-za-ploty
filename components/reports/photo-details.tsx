"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";

import { savePhotoDetails, type PhotoDetailsState } from "@/app/(app)/reports/photo-actions";
import { Button } from "@/components/ui/button";
import { PHOTO_STATUSES, RETIRED_PHOTO_STATUSES } from "@/lib/photo-captions";
import type { PhotoCategory } from "@/types/database";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
      <Check aria-hidden />
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

/**
 * The caption and status for one photograph, edited in place under its
 * thumbnail.
 *
 * Deliberately not a modal. On site this gets used one-handed with the phone
 * in the rain: the picture and the words about it need to be on screen at the
 * same time, and every extra tap is one more chance to give up and leave the
 * caption empty - which is how a report ends up saying nothing under twelve
 * photographs.
 *
 * A photograph still carrying a retired status keeps it in the menu, so
 * editing its caption cannot silently reclassify it.
 */
export function PhotoDetails({
  photoId,
  caption,
  category,
}: {
  photoId: string;
  caption: string | null;
  category: PhotoCategory;
}) {
  const save = savePhotoDetails.bind(null, photoId);
  const [state, action] = useActionState<PhotoDetailsState, FormData>(save, {});

  const retired = RETIRED_PHOTO_STATUSES.filter((status) => status.value === category);
  const options = [...PHOTO_STATUSES, ...retired];

  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`caption-${photoId}`}>
        Caption for this photograph
      </label>
      <input
        id={`caption-${photoId}`}
        name="caption"
        defaultValue={caption ?? ""}
        placeholder="What does this show?"
        maxLength={300}
        className="min-h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle"
      />

      <label className="sr-only" htmlFor={`status-${photoId}`}>
        Status for this photograph
      </label>
      <select
        id={`status-${photoId}`}
        name="category"
        defaultValue={category}
        className="min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <SaveButton />
        {state.saved ? <span className="text-xs text-ink-muted">Saved</span> : null}
        {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}
