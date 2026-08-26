"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ProjectFormState } from "@/app/(app)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STATUS_LABELS } from "@/components/projects/status-badge";
import type { Project, ProjectStatus } from "@/types/database";

type ProjectFormProps = {
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  project?: Project;
  submitLabel: string;
  cancelHref: string;
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ProjectForm({
  action,
  project,
  submitLabel,
  cancelHref,
}: ProjectFormProps) {
  const [state, formAction] = useActionState<ProjectFormState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="flex flex-col gap-5">
        <Field label="Project name" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={project?.name ?? ""}
            placeholder="Lidl South Croydon — External Works"
            autoCapitalize="words"
            required
            aria-invalid={Boolean(errors.name)}
          />
        </Field>

        <Field label="Client" htmlFor="client" optional error={errors.client}>
          <Input
            id="client"
            name="client"
            defaultValue={project?.client ?? ""}
            placeholder="Lidl GB"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Site address" htmlFor="site_address" optional error={errors.site_address}>
          <Input
            id="site_address"
            name="site_address"
            defaultValue={project?.site_address ?? ""}
            placeholder="South Croydon"
            autoCapitalize="words"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Postcode" htmlFor="postcode" optional error={errors.postcode}>
            <Input
              id="postcode"
              name="postcode"
              defaultValue={project?.postcode ?? ""}
              placeholder="CR2 6EA"
              autoCapitalize="characters"
            />
          </Field>

          <Field
            label="Project reference"
            htmlFor="project_reference"
            optional
            error={errors.project_reference}
          >
            <Input
              id="project_reference"
              name="project_reference"
              defaultValue={project?.project_reference ?? ""}
              placeholder="1470"
            />
          </Field>
        </div>

        <Field label="Site manager" htmlFor="site_manager" optional error={errors.site_manager}>
          <Input
            id="site_manager"
            name="site_manager"
            defaultValue={project?.site_manager ?? ""}
            placeholder="Maciej"
            autoCapitalize="words"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Start date" htmlFor="start_date" optional error={errors.start_date}>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={project?.start_date ?? ""}
            />
          </Field>

          <Field
            label="Expected completion"
            htmlFor="expected_completion_date"
            optional
            error={errors.expected_completion_date}
          >
            <Input
              id="expected_completion_date"
              name="expected_completion_date"
              type="date"
              defaultValue={project?.expected_completion_date ?? ""}
              aria-invalid={Boolean(errors.expected_completion_date)}
            />
          </Field>
        </div>

        <Field label="Status" htmlFor="status" error={errors.status}>
          <Select id="status" name="status" defaultValue={project?.status ?? "active"}>
            {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((value) => (
              <option key={value} value={value}>
                {PROJECT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Description" htmlFor="description" optional error={errors.description}>
          <Textarea
            id="description"
            name="description"
            defaultValue={project?.description ?? ""}
            placeholder="Scope of works, access arrangements, anything the team should know."
            rows={4}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
        <SaveButton label={submitLabel} />
        <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
