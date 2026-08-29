"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Sparkles } from "lucide-react";

import {
  describePhotoAction,
  savePhotoDetails,
  type PhotoDescriptionState,
  type PhotoDetailsState,
} from "@/app/(app)/reports/photo-actions";
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

function DescribeButton({ again }: { again: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="ghost" loading={pending} className="self-start">
      <Sparkles aria-hidden />
      {pending ? "Looking…" : again ? "Try again" : "Describe with AI"}
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
 * caption empty.
 *
 * The AI suggestion is a suggestion. It arrives in its own panel and does not
 * touch the caption box until the user presses Use it, and even then nothing
 * is stored until they press Save. A caption somebody wrote by hand is never
 * replaced by a model - not on generate, not on regenerate, not by arriving
 * while they were typing.
 */
export function PhotoDetails({
  photoId,
  caption,
  category,
  aiConfigured = false,
}: {
  photoId: string;
  caption: string | null;
  category: PhotoCategory;
  aiConfigured?: boolean;
}) {
  const save = savePhotoDetails.bind(null, photoId);
  const describe = describePhotoAction.bind(null, photoId);
  const [state, action] = useActionState<PhotoDetailsState, FormData>(save, {});
  const [suggestion, describeAction] = useActionState<PhotoDescriptionState, FormData>(describe, {});

  // Controlled so a suggestion can be dropped in without a save, and so the
  // user's own typing survives a regeneration.
  const [text, setText] = useState(caption ?? "");
  const [dismissed, setDismissed] = useState(false);

  const retired = RETIRED_PHOTO_STATUSES.filter((status) => status.value === category);
  const options = [...PHOTO_STATUSES, ...retired];
  const showing = suggestion.description && !dismissed ? suggestion.description : null;

  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-col gap-2">
        <label className="sr-only" htmlFor={`caption-${photoId}`}>
          Caption for this photograph
        </label>
        <textarea
          id={`caption-${photoId}`}
          name="caption"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What does this show?"
          maxLength={300}
          rows={2}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle"
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

      {aiConfigured ? (
        <form action={describeAction} onSubmit={() => setDismissed(false)}>
          <DescribeButton again={Boolean(suggestion.description || suggestion.error)} />
        </form>
      ) : null}

      {suggestion.error ? <p className="text-xs text-danger">{suggestion.error}</p> : null}

      {showing ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-muted p-2">
          <p className="text-xs text-ink-muted">Suggested description</p>
          <p className="text-sm text-ink">{showing}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => { setText(showing); setDismissed(true); }}>
              Use it
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
            >
              Ignore
            </Button>
          </div>
          <p className="text-xs text-ink-subtle">
            Check it against the photograph. Nothing is saved until you press Save.
          </p>
        </div>
      ) : null}
    </div>
  );
}
