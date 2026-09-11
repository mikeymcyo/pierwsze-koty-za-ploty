"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Sparkles } from "lucide-react";

import { resolveIssue, type ResolveIssueState } from "@/app/(app)/issues/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending}>
      <Check aria-hidden />
      {pending ? "Resolving…" : "Confirm resolved"}
    </Button>
  );
}

/**
 * Mark an issue resolved where it is listed, with one line on what was done.
 *
 * Two ways in, one action. Pressed by hand it opens a note box under the
 * issue. Offered by Prepare Daily - the day's notes said the thing was done -
 * it arrives already open, headed "Resolve this issue?", with the note
 * pre-filled in the site manager's own words. Either way the issue changes
 * only when Confirm is pressed; a suggestion left alone changes nothing.
 */
export function ResolveIssue({
  issueId,
  suggestedNote,
  returnPath,
}: {
  issueId: string;
  /** Present when today's Daily suggested this issue is resolved. */
  suggestedNote?: string;
  /** The screen this sits on, refreshed once the issue is resolved. */
  returnPath?: string;
}) {
  const suggested = suggestedNote !== undefined;
  const [open, setOpen] = useState(suggested);
  const [state, action] = useActionState<ResolveIssueState, FormData>(resolveIssue, {});
  const id = useId();

  if (state.resolved) return null;

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Check aria-hidden />
        Mark resolved
      </Button>
    );
  }

  return (
    <form
      action={action}
      className={
        suggested
          ? "flex w-full flex-col gap-3 rounded-control bg-brand-soft p-3 ring-1 ring-brand/40 ring-inset"
          : "flex w-full flex-col gap-3 rounded-control bg-surface-sunken/60 p-3 ring-1 ring-line/70 ring-inset"
      }
    >
      <input type="hidden" name="issueId" value={issueId} />
      {returnPath ? <input type="hidden" name="returnPath" value={returnPath} /> : null}
      {suggested ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles aria-hidden className="size-4 text-brand" />
          Resolve this issue? Today&rsquo;s notes say it was done.
        </p>
      ) : null}
      <label htmlFor={`${id}-note`} className="text-xs font-semibold text-ink-muted">
        What was done
      </label>
      <input
        id={`${id}-note`}
        name="note"
        defaultValue={suggestedNote ?? ""}
        placeholder="Inserts arrived Monday; section completed."
        maxLength={500}
        required
        className="min-h-11 w-full rounded-control bg-surface px-3 text-sm text-ink ring-1 ring-line-strong/70 ring-inset placeholder:text-ink-subtle focus:ring-2 focus:ring-brand/60 focus:outline-none"
      />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <ConfirmButton />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {suggested ? "Leave it open" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
