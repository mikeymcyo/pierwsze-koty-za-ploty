"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import {
  describePhotoAction,
  savePhotoDetails,
  type PhotoDescriptionState,
  type PhotoDetailsState,
} from "@/app/(app)/reports/photo-actions";
import { describeActionFailure } from "@/lib/actions/recover";
import { PhotoDescriptionField } from "@/components/reports/photo-description-field";
import { Button } from "@/components/ui/button";
import { PHOTO_STATUSES, RETIRED_PHOTO_STATUSES } from "@/lib/photo-captions";
import type { PhotoCategory } from "@/types/database";
import { useRecoverableActionState } from "@/lib/hooks/use-recoverable-action-state";

type Details = { text: string; status: string };

function sameDetails(a: Details, b: Details | null) {
  return a.text === b?.text && a.status === b.status;
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
 * touch the caption box until the user presses Use it. A caption somebody
 * wrote by hand is never replaced by a model - not on generate, not on
 * regenerate, not by arriving while they were typing.
 *
 * ## No Save button
 *
 * There was one, under every photograph, and a screen of twelve plates carried
 * twelve of them. Worse, a caption typed and then scrolled past was a caption
 * lost. So the caption saves itself: shortly after typing stops, on blur, and
 * immediately when the status is changed or a suggestion accepted. The rules
 * around it are unchanged - an issued report still refuses the write, server
 * side, and the model still never writes a caption a person did not accept.
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
  const describe = describePhotoAction.bind(null, photoId);
  const [suggestion, describeAction] = useRecoverableActionState<PhotoDescriptionState, FormData>(describe, {});
  const [draft, setDraft] = useState<Details>({ text: caption ?? "", status: String(category) });
  const [state, setState] = useState<PhotoDetailsState>({});
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const current = useRef(draft);
  const confirmed = useRef<Details | null>(draft);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function submit() {
    clearTimeout(timer.current);
    if (busy.current || sameDetails(current.current, confirmed.current)) return;
    busy.current = true;
    setSaving(true);
    try {
      // Only one write at a time. A changed draft goes next, even if the previous reply was lost.
      while (!sameDetails(current.current, confirmed.current)) {
        const snapshot = current.current;
        const data = new FormData();
        data.set("caption", snapshot.text);
        data.set("category", snapshot.status);
        let result: PhotoDetailsState;
        try {
          result = await savePhotoDetails(photoId, {}, data);
        } catch (error) {
          result = { error: describeActionFailure(error) };
        }
        confirmed.current = result.saved && !result.error ? snapshot : null;
        if (sameDetails(snapshot, current.current)) {
          setState(confirmed.current ? { saved: true } : { error: result.error || "Caption could not be saved." });
          break;
        }
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function edit(next: Details, immediate = false) {
    current.current = next;
    setDraft(next);
    setState({});
    clearTimeout(timer.current);
    if (immediate) void submit();
    else timer.current = setTimeout(submit, 900);
  }

  const retired = RETIRED_PHOTO_STATUSES.filter((option) => option.value === category);
  const options = [...PHOTO_STATUSES, ...retired];
  const showing = suggestion.description && !dismissed ? suggestion.description : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        {/* The same box as the one a consolidated report's caption is typed
            in - see components/reports/photo-description-field.tsx. Leaving it
            saves now, which covers the case the debounce was written for: a
            description typed and then scrolled past. */}
        <PhotoDescriptionField
          id={`caption-${photoId}`}
          name="caption"
          value={draft.text}
          onChange={(text) => edit({ ...current.current, text })}
          onBlur={submit}
        />

        <label className="sr-only" htmlFor={`status-${photoId}`}>
          Status for this photograph
        </label>
        <select
          id={`status-${photoId}`}
          name="category"
          value={draft.status}
          onChange={(event) => edit({ ...current.current, status: event.target.value }, true)}
          className="min-h-(--ui-control-min) w-full rounded-full bg-surface-muted px-3 text-[length:max(16px,1rem)] font-semibold text-ink-muted ring-1 ring-line/60 ring-inset transition-colors hover:text-ink focus:ring-2 focus:ring-brand/60 focus:outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div role="status" aria-live="polite" aria-atomic="true" className="flex min-h-4 items-center gap-2 text-xs text-ink-muted">
          {saving ? "Saving…" : state.error ? (
            <>
              <span className="text-danger">{state.error}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => void submit()}>Retry save</Button>
            </>
          ) : state.saved ? "Saved" : null}
        </div>
      </div>

      {aiConfigured ? (
        <form action={describeAction} onSubmit={() => setDismissed(false)}>
          <DescribeButton again={Boolean(suggestion.description || suggestion.error)} />
        </form>
      ) : null}

      {suggestion.error ? <p className="text-xs text-danger">{suggestion.error}</p> : null}

      {showing ? (
        <div className="flex flex-col gap-2 rounded-control bg-surface-muted p-3 ring-1 ring-brand/20 ring-inset animate-fade">
          <p className="text-xs font-semibold text-brand-ink">Suggested description</p>
          <p className="text-sm break-words text-ink">{showing}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                // Accepted means kept. Waiting for a second press was the step
                // that lost suggestions people had already agreed with.
                edit({ ...current.current, text: showing }, true);
                setDismissed(true);
              }}
            >
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
            Check it against the photograph. Accepting it saves it, and you can
            still edit it afterwards.
          </p>
        </div>
      ) : null}
    </div>
  );
}
