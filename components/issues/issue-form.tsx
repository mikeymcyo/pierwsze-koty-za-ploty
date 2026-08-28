"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { updateIssue, type IssueFormState } from "@/app/(app)/issues/actions";
import type { PhotoChoice } from "@/components/issues/raise-issue";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@/lib/issues/metadata";
import type { Issue } from "@/types/database";

type EditableIssue = Pick<
  Issue,
  "id" | "title" | "description" | "responsible" | "photo_id" | "priority" | "status"
>;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending}>
      {pending ? "Saving…" : "Save issue"}
    </Button>
  );
}

export function IssueForm({
  issue,
  photos,
  cancelHref,
}: {
  issue: EditableIssue;
  photos: PhotoChoice[];
  cancelHref: string;
}) {
  const save = updateIssue.bind(null, issue.id);
  const [state, formAction] = useActionState<IssueFormState, FormData>(save, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="info">Issue saved.</Alert> : null}

      <div className="flex flex-col gap-5">
        <Field label="What is the issue" htmlFor="title" error={errors.title}>
          <Input
            id="title"
            name="title"
            defaultValue={issue.title}
            required
            aria-invalid={Boolean(errors.title)}
          />
        </Field>

        <Field label="Detail" htmlFor="description" optional error={errors.description}>
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={issue.description ?? ""}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Priority" htmlFor="priority" error={errors.priority}>
            <Select id="priority" name="priority" defaultValue={issue.priority}>
              {ISSUE_PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status" error={errors.status}>
            <Select id="status" name="status" defaultValue={issue.status}>
              {ISSUE_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Responsible" htmlFor="responsible" optional error={errors.responsible}>
          <Input
            id="responsible"
            name="responsible"
            defaultValue={issue.responsible ?? ""}
            autoCapitalize="words"
          />
        </Field>

        <Field
          label="Photo"
          htmlFor="photoId"
          optional
          error={errors.photoId}
          hint="A photo from this project that shows the problem."
        >
          <Select id="photoId" name="photoId" defaultValue={issue.photo_id ?? ""}>
            <option value="">No photo</option>
            {photos.map((photo) => (
              <option key={photo.id} value={photo.id}>
                {photo.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <SaveButton />
        <Button asChild variant="secondary" size="lg">
          <Link href={cancelHref}>Back</Link>
        </Button>
      </div>
    </form>
  );
}
