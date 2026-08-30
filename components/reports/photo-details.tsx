"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import {
  describePhotoAction,
  savePhotoDetails,
  type PhotoDescriptionState,
  type PhotoDetailsState,
} from "@/app/(app)/reports/photo-actions";
import { Button } from "@/components/ui/button";
import { PHOTO_STATUSES, RETIRED_PHOTO_STATUSES } from "@/lib/photo-captions";
import type { PhotoCategory } from "@/types/database";

/**
 * What the caption box is doing, in three words or fewer.
 *
 * There is no Save button any more, so this is the only thing telling somebody
 * their words are safe. It has to be quiet enough to ignore and present enough
 * to trust.
 */
function SaveState({ saved, error }: { saved: boolean; error?: string }) {
  const { pending } = useFormStatus();
  if (error) return <span className="text-xs text-danger">{error}</span>;
  if (pending) return <span className="text-xs text-ink-subtle">Saving…</span>;
  if (saved) return <span className="text-xs text-ink-muted">Saved</span>;
  return null;
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
  const save = savePhotoDetails.bind(null, photoId);
  const describe = describePhotoAction.bind(null, photoId);
  const [state, action] = useActionState<PhotoDetailsState, FormData>(save, {});
  const [suggestion, describeAction] = useActionState<PhotoDescriptionState, FormData>(describe, {});

  // Controlled so a suggestion can be dropped in without a save, and so the
  // user's own typing survives a regeneration.
  const [text, setText] = useState(caption ?? "");
  const [status, setStatus] = useState<string>(category);
  const [dismissed, setDismissed] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  // What is on the server, as far as this component knows. Submitting only
  // when the value has actually moved away from it keeps a debounce, a blur
  // and a status change from firing three writes for one edit.
  const savedRef = useRef({ text: caption ?? "", status: String(category) });

  // Bumped when something should be saved now rather than in a moment: a
  // status chosen, a suggestion accepted. It is a counter rather than a
  // boolean so two accepts in a row are two saves.
  const [flush, setFlush] = useState(0);

  const submit = () => {
    if (text === savedRef.current.text && status === savedRef.current.status) return;
    savedRef.current = { text, status };
    formRef.current?.requestSubmit();
  };

  // Shortly after typing stops. Long enough not to write on every keystroke,
  // short enough that a caption is safe before somebody's thumb reaches the
  // next photograph.
  useEffect(() => {
    if (text === savedRef.current.text && status === savedRef.current.status) return;
    const timer = setTimeout(submit, 900);
    return () => clearTimeout(timer);
    // `submit` is recreated each render and reads the current values, so the
    // dependencies are the values themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, status]);

  // Runs after the commit that carries the new value, which is the point: a
  // form submitted from inside the click handler would post the old caption,
  // because the textarea is controlled and has not re-rendered yet.
  useEffect(() => {
    if (flush === 0) return;
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  const retired = RETIRED_PHOTO_STATUSES.filter((option) => option.value === category);
  const options = [...PHOTO_STATUSES, ...retired];
  const showing = suggestion.description && !dismissed ? suggestion.description : null;

  return (
    <div className="flex flex-col gap-2">
      <form ref={formRef} action={action} className="flex flex-col gap-2">
        <label className="sr-only" htmlFor={`caption-${photoId}`}>
          Caption for this photograph
        </label>
        <textarea
          id={`caption-${photoId}`}
          name="caption"
          value={text}
          onChange={(event) => setText(event.target.value)}
          // Belt and braces on the debounce: leaving the box saves it now,
          // which covers the case the timer was written for - a caption typed
          // and then scrolled past.
          onBlur={submit}
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
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            // A status is a decision, not a draft: saved as soon as it changes.
            setFlush((count) => count + 1);
          }}
          className="min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <SaveState saved={Boolean(state.saved)} error={state.error} />
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
            <Button
              type="button"
              size="sm"
              onClick={() => {
                // Accepted means kept. Waiting for a second press was the step
                // that lost suggestions people had already agreed with.
                setText(showing);
                setDismissed(true);
                setFlush((count) => count + 1);
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
