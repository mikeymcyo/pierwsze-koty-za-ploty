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
import type { SummarySourceMode } from "@/lib/summary-reports/provenance";
import { cn } from "@/lib/utils";
import type { SummaryReportKind } from "@/types/database";

/**
 * The two honest ways to write a Progress Report.
 *
 * Consolidating issued Daily Reports is the original path and stays the
 * default. Writing it directly is for the week the site manager was not there
 * and the work came back by phone, by message and by photograph - which is a
 * real week on a real job, and used to be impossible.
 */
const SOURCE_MODES: { value: SummarySourceMode; label: string; description: string }[] = [
  {
    value: "sources",
    label: "From issued Daily Reports",
    description:
      "Every final Daily Report in the period becomes the evidence, and is listed in the PDF as the source record.",
  },
  {
    value: "standalone",
    label: "Write it directly",
    description:
      "No Daily Reports needed. Type or dictate what happened, add photographs and issues, and draft from those. The report will not claim any Daily Reports behind it.",
  },
];

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
  const [sourceMode, setSourceMode] = useState<SummarySourceMode>("sources");
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

      {/* Only a Progress Report has the choice. A Completion Report is a
          consolidation by definition - it is the record of a job, drawn from
          what was issued while the job ran. */}
      {kind === "progress" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Where the content comes from</legend>
          <input type="hidden" name="sourceMode" value={sourceMode} />
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCE_MODES.map((mode) => {
              const active = mode.value === sourceMode;
              return (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSourceMode(mode.value)}
                  className={cn(
                    "flex min-h-(--ui-control-min) flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <span className="font-semibold text-ink">{mode.label}</span>
                  <span className="text-xs text-ink-muted">{mode.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

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
        {kind === "completion"
          ? "Issued Progress Reports are used first, with every underlying Daily Report retained as provenance. Leave the dates blank for the whole project."
          : sourceMode === "standalone"
            ? "Nothing is consolidated. You write the report from your own notes, photographs, issues and documents, and it says so - there is no source record and nothing claims to come from a Daily Report."
            : "All final Daily Reports in this period become the evidence for the draft."}
      </Alert>

      <div className="flex flex-wrap gap-3">
        <StartButton />
        <Button asChild variant="secondary" size="lg"><Link href="/reports">Cancel</Link></Button>
      </div>
    </form>
  );
}
