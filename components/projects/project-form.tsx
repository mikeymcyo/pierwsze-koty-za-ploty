"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
import { StorePicker } from "@/components/stores/store-picker";
import type { ResolvedStore } from "@/lib/stores/directory";
import type { Project, ProjectStatus } from "@/types/database";

type ProjectFormProps = {
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  project?: Project;
  /**
   * Starting values for a new project, from a selected store. Ignored when an
   * existing project is being edited - what is already saved always wins over
   * a suggestion.
   */
  defaults?: Partial<Project>;
  /** Shown above the form to say where these values came from. */
  banner?: ReactNode;
  /**
   * The store this project is at, when it has one. Null offers the picker;
   * leaving it unselected keeps the project an ordinary manually entered one,
   * which is what every project made before the directory existed stays.
   */
  store?: ResolvedStore | null;
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
  defaults,
  banner,
  store = null,
  submitLabel,
  cancelHref,
}: ProjectFormProps) {
  const [state, formAction] = useActionState<ProjectFormState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};
  // A saved project is never overridden by a suggestion; a new one starts from
  // whatever the store filled in, and every field stays editable.
  const initial = project ?? defaults;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {banner}

      <div className="flex flex-col gap-5">
        <Field label="Project name" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={initial?.name ?? ""}
            placeholder="Lidl South Croydon — External Works"
            autoCapitalize="words"
            required
            aria-invalid={Boolean(errors.name)}
          />
        </Field>

        {/* The place, before the paperwork about the place. Selecting a store
            fills in the fields below that are still empty. */}
        <StorePicker initial={store} />
        {errors.location_code ? (
          <Alert tone="danger">{errors.location_code}</Alert>
        ) : null}

        <Field label="Client" htmlFor="client" optional error={errors.client}>
          <Input
            id="client"
            name="client"
            defaultValue={initial?.client ?? ""}
            placeholder="Lidl GB"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Site address" htmlFor="site_address" optional error={errors.site_address}>
          <Input
            id="site_address"
            name="site_address"
            defaultValue={initial?.site_address ?? ""}
            placeholder="South Croydon"
            autoCapitalize="words"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Postcode" htmlFor="postcode" optional error={errors.postcode}>
            <Input
              id="postcode"
              name="postcode"
              defaultValue={initial?.postcode ?? ""}
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
              defaultValue={initial?.project_reference ?? ""}
              placeholder="1470"
            />
          </Field>
        </div>

        <Field label="Site manager" htmlFor="site_manager" optional error={errors.site_manager}>
          <Input
            id="site_manager"
            name="site_manager"
            defaultValue={initial?.site_manager ?? ""}
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
              defaultValue={initial?.start_date ?? ""}
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
              defaultValue={initial?.expected_completion_date ?? ""}
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
            defaultValue={initial?.description ?? ""}
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
