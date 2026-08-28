"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { startSummaryReport, type SummaryFormState } from "@/app/(app)/summary-reports/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SummaryReportKind } from "@/types/database";

function StartButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending}>
      {pending ? "Preparing…" : "Start report"}
    </Button>
  );
}

export function SummaryCreateForm({
  projects,
  defaultProjectId,
  defaultKind,
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  defaultKind: SummaryReportKind;
}) {
  const [kind, setKind] = useState<SummaryReportKind>(defaultKind);
  const [state, action] = useActionState<SummaryFormState, FormData>(startSummaryReport, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Report type" htmlFor="kind" error={errors.kind}>
        <Select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as SummaryReportKind)}
        >
          <option value="progress">Progress Report</option>
          <option value="completion">Completion Report</option>
        </Select>
      </Field>

      <Field label="Project" htmlFor="projectId" error={errors.projectId}>
        <Select id="projectId" name="projectId" defaultValue={defaultProjectId ?? ""} required>
          <option value="" disabled>Choose a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </Select>
      </Field>

      <Field
        label="Document title"
        htmlFor="title"
        optional
        error={errors.title}
        hint="Leave blank to use the numbered report title."
      >
        <Input id="title" name="title" placeholder={kind === "progress" ? "Fortnightly progress update" : "Project completion report"} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Period start"
          htmlFor="periodStart"
          optional={kind === "completion"}
          error={errors.periodStart}
        >
          <Input id="periodStart" name="periodStart" type="date" required={kind === "progress"} />
        </Field>
        <Field
          label="Period end"
          htmlFor="periodEnd"
          optional={kind === "completion"}
          error={errors.periodEnd}
        >
          <Input id="periodEnd" name="periodEnd" type="date" required={kind === "progress"} />
        </Field>
      </div>

      <Alert tone="info">
        {kind === "progress"
          ? "All final Daily Reports in this period become the evidence for the draft."
          : "Issued Progress Reports are used first, with every underlying Daily Report retained as provenance. Leave the dates blank for the whole project."}
      </Alert>

      <div className="flex flex-wrap gap-3">
        <StartButton />
        <Button asChild variant="secondary" size="lg"><Link href="/reports">Cancel</Link></Button>
      </div>
    </form>
  );
}
