"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import { startSiteSurvey, type SurveyFormState } from "@/app/(app)/surveys/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type SurveyProjectChoice = { id: string; name: string; isEnquiry: boolean };

function StartButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending}>
      {pending ? "Starting…" : "Start survey"}
    </Button>
  );
}

/**
 * Starting a survey.
 *
 * Four questions, because that is all a survey needs before somebody can begin
 * writing it: where, what to call it, when it was visited, and why. Everything
 * else - findings, measurements, access, recommendations, photographs,
 * documents - is written on the survey itself.
 *
 * There is deliberately nothing here about workforce, plant, deliveries or
 * works completed. No works have started.
 */
export function SurveyCreateForm({
  projects,
  store,
  defaultProjectId,
  today,
}: {
  projects: SurveyProjectChoice[];
  /** Set when this was started from a store, and no project exists yet. */
  store: { directoryId: string; code: string; displayName: string; displayCode: string; client: string } | null;
  defaultProjectId?: string;
  today: string;
}) {
  const [state, action] = useActionState<SurveyFormState, FormData>(startSiteSurvey, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {store ? (
        <>
          <input type="hidden" name="directory" value={store.directoryId} />
          <input type="hidden" name="storeCode" value={store.code} />
          <div className="rounded-2xl border border-line bg-surface-muted p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Surveying
            </p>
            <p className="mt-1 font-semibold text-ink">
              {store.client} {store.displayName}
            </p>
            <p className="font-mono text-sm tabular-nums text-ink-muted">
              Store {store.displayCode}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              This starts an enquiry for the store rather than a live job. If the work is
              awarded later, one tap on the project turns it into an active project and the
              survey, its photographs and its documents come with it.
            </p>
          </div>
        </>
      ) : null}

      <Field
        label={store ? "Or attach it to an existing project" : "Project"}
        htmlFor="projectId"
        optional={Boolean(store)}
        error={errors.projectId}
      >
        <Select id="projectId" name="projectId" defaultValue={defaultProjectId ?? ""}>
          <option value="">
            {store ? "New enquiry for this store" : "Choose a project"}
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.isEnquiry ? " (enquiry)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Title" htmlFor="title" optional error={errors.title}>
        <Input
          id="title"
          name="title"
          placeholder="Hoarding condition survey"
          autoCapitalize="sentences"
        />
      </Field>

      <Field label="Date of visit" htmlFor="visitedOn" error={errors.visitedOn}>
        <Input id="visitedOn" name="visitedOn" type="date" defaultValue={today} required />
      </Field>

      <Field label="Purpose of visit" htmlFor="purpose" optional error={errors.purpose}>
        <Textarea
          id="purpose"
          name="purpose"
          rows={3}
          placeholder="Why the visit was made and what was being investigated."
        />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
        <StartButton />
        <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
          <Link href={store ? `/stores/${store.code}` : "/reports"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
