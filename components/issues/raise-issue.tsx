"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

import { createIssue, type IssueFormState } from "@/app/(app)/issues/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ISSUE_PRIORITIES } from "@/lib/issues/metadata";

export type PhotoChoice = { id: string; label: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="self-start">
      {pending ? "Raising…" : "Raise issue"}
    </Button>
  );
}

/**
 * Raising an issue where it is noticed.
 *
 * Collapsed until asked for: on the capture screen this sits among the day's
 * work and most days there is nothing to raise, so an open form would be in
 * the way. Raising one does not navigate anywhere - the site manager is in the
 * middle of writing his report.
 */
export function RaiseIssue({
  projectId,
  reportId,
  photos = [],
}: {
  projectId: string;
  reportId: string | null;
  photos?: PhotoChoice[];
}) {
  const [state, formAction] = useActionState<IssueFormState, FormData>(createIssue, {});
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const id = useId();
  const errors = state.fieldErrors ?? {};

  // Derived during render rather than in an effect: an effect that calls
  // setState here would render the open form once before collapsing it, which
  // is both a wasted render and a visible flicker. Collapsing unmounts the
  // form, so the next issue starts with empty boxes without anything having to
  // reset them.
  if (state.created && !acknowledged) {
    setAcknowledged(true);
    setOpen(false);
  }
  if (!state.created && acknowledged) setAcknowledged(false);

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        {state.created ? (
          <Alert tone="info">
            Issue raised. It is on the project&apos;s Open Issues tab.
          </Alert>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="self-start"
          onClick={() => setOpen(true)}
        >
          <AlertTriangle aria-hidden />
          Raise issue
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-xl border border-line bg-surface-muted p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-ink">Raise an issue</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          aria-label="Cancel raising an issue"
        >
          <X aria-hidden />
        </Button>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="reportId" value={reportId ?? ""} />

      <Field label="What is the issue" htmlFor={`${id}-title`} error={errors.title}>
        <Input
          id={`${id}-title`}
          name="title"
          placeholder="Drainage run blocked by stored materials"
          required
          aria-invalid={Boolean(errors.title)}
        />
      </Field>

      <Field
        label="Detail"
        htmlFor={`${id}-description`}
        optional
        error={errors.description}
        hint="What is affected, and what needs to happen."
      >
        <Textarea id={`${id}-description`} name="description" rows={3} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Priority" htmlFor={`${id}-priority`} error={errors.priority}>
          <Select id={`${id}-priority`} name="priority" defaultValue="medium">
            {ISSUE_PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Responsible"
          htmlFor={`${id}-responsible`}
          optional
          error={errors.responsible}
          hint="The trade or company it sits with."
        >
          <Input id={`${id}-responsible`} name="responsible" autoCapitalize="words" />
        </Field>
      </div>

      {photos.length > 0 ? (
        <Field
          label="Photo"
          htmlFor={`${id}-photo`}
          optional
          error={errors.photoId}
          hint="One of the photos on this report, if it shows the problem."
        >
          <Select id={`${id}-photo`} name="photoId" defaultValue="">
            <option value="">No photo</option>
            {photos.map((photo) => (
              <option key={photo.id} value={photo.id}>
                {photo.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <SubmitButton />
    </form>
  );
}
