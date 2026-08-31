"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { startSummaryReport, type SummaryFormState } from "@/app/(app)/summary-reports/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  alreadyConsolidated,
  defaultDailySelection,
  type SelectableDaily,
} from "@/lib/summary-reports/daily-selection";
import type { SummarySourceMode } from "@/lib/summary-reports/provenance";
import { formatDate, formatReportNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { SummaryReportKind } from "@/types/database";

/**
 * The two honest ways to write a consolidated report.
 *
 * Consolidating issued reports is the original path and stays the default.
 * Writing it directly is for the week the site manager was not there and the
 * work came back by phone, by message and by photograph - and, for a
 * Completion Report, for the job that finished without a Daily Report ever
 * having been filed. Both are real jobs; both used to be impossible.
 */
function sourceModes(
  kind: SummaryReportKind,
): { value: SummarySourceMode; label: string; description: string }[] {
  const completion = kind === "completion";
  return [
    {
      value: "sources",
      label: completion ? "From issued reports" : "From issued Daily Reports",
      description: completion
        ? "Issued Progress Reports are used first, with every underlying Daily Report kept as provenance and listed in the PDF."
        : "Every final Daily Report in the period becomes the evidence, and is listed in the PDF as the source record.",
    },
    {
      value: "standalone",
      label: "Write it directly",
      description:
        "No previous reports needed. Type or dictate what happened, add photographs, documents and issues, and draft from those. The report will not claim any reports behind it.",
    },
  ];
}

function StartButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending}>
      {pending ? "Preparing…" : "Start report"}
    </Button>
  );
}


/**
 * The Daily Reports this Progress Report is built from.
 *
 * One row per issued report, ticked or not, and nothing else on it: the number
 * a client will see quoted in the source record, the day the work was done, and
 * the time it was issued. Rows are full-width and at least as tall as the
 * touch token, because this is chosen standing up on an iPad.
 *
 * Nothing here is a range. What is ticked is what the report is built from and
 * what its source record will say - see requirement 5, provenance.
 */
function DailyPicker({
  dailies,
  selected,
  onToggle,
  onAll,
  onNone,
}: {
  dailies: SelectableDaily[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  const consolidated = alreadyConsolidated(dailies);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-ink">
        Daily Reports to consolidate
      </legend>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-muted" aria-live="polite">
          {selected.size} of {dailies.length} selected
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onAll}>
            Select all
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onNone}>
            Clear
          </Button>
        </div>
      </div>

      {consolidated.length > 0 ? (
        <p className="text-xs text-ink-subtle">
          {consolidated.length === 1 ? "One report is" : `${consolidated.length} reports are`}{" "}
          already in an issued Progress Report. They are left unticked, not hidden - tick one
          if this report should cover it again.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {dailies.map((daily) => {
          const checked = selected.has(daily.id);
          return (
            <li key={daily.id}>
              <label
                className={cn(
                  "flex min-h-(--ui-control-min) cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                  checked ? "border-brand bg-brand-soft" : "border-line bg-surface",
                )}
              >
                <input
                  type="checkbox"
                  name="reportIds"
                  value={daily.id}
                  checked={checked}
                  onChange={() => onToggle(daily.id)}
                  className="size-5 shrink-0 accent-[var(--color-brand)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    Daily Report {formatReportNumber(daily.number)}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {formatDate(daily.date)}
                    {daily.issuedAt
                      ? ` · issued ${new Date(daily.issuedAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : ""}
                    {daily.usedIn !== null
                      ? ` · already in Progress Report ${formatReportNumber(daily.usedIn)}`
                      : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function SummaryCreateForm({
  projects,
  defaultProjectId,
  defaultKind,
  dailies,
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  defaultKind: SummaryReportKind;
  /** The issued Daily Reports of the chosen project, empty until one is chosen. */
  dailies: SelectableDaily[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<SummaryReportKind>(defaultKind);
  const [sourceMode, setSourceMode] = useState<SummarySourceMode>("sources");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  // Keyed on the project in the URL, so choosing a different site starts from
  // that site's sensible default rather than carrying the last one's ticks.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultDailySelection(dailies)),
  );
  const [state, action] = useActionState<SummaryFormState, FormData>(startSummaryReport, {});
  const errors = state.fieldErrors ?? {};

  // The picker is the Progress Report's whole point. A Completion Report
  // consolidates issued Progress Reports and keeps its own flow, and a report
  // written directly consolidates nothing at all.
  const picking = kind === "progress" && sourceMode === "sources";

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
        {/* Navigating rather than fetching: the page reloads with that
            project's issued Daily Reports, decided by the server under the
            same row-level security as everything else. */}
        <Select
          id="projectId"
          name="projectId"
          value={projectId}
          onChange={(event) => {
            const next = event.target.value;
            setProjectId(next);
            router.replace(`/summary-reports/new?kind=${kind}&project=${next}`);
          }}
          required
        >
          <option value="" disabled>Choose a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </Select>
      </Field>

      {/* Both kinds have the choice. A Completion Report is a consolidation by
          intent, but a job can genuinely finish with nothing issued behind it,
          and refusing to write that job's completion document does not make
          the job less finished. */}
      <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Where the content comes from</legend>
          <input type="hidden" name="sourceMode" value={sourceMode} />
          <div className="grid gap-2 sm:grid-cols-2">
            {sourceModes(kind).map((mode) => {
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

      {picking && projectId ? (
        dailies.length > 0 ? (
          <DailyPicker
            dailies={dailies}
            selected={selected}
            onToggle={(id) =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onAll={() => setSelected(new Set(dailies.map((daily) => daily.id)))}
            onNone={() => setSelected(new Set())}
          />
        ) : (
          <Alert tone="info">
            This project has no issued Daily Reports yet. Issue one, or write this Progress
            Report directly.
          </Alert>
        )
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
        {/* Optional on both, and blank means blank: no date is invented for a
            report whose author did not give one. */}
        <Field label="Period start" htmlFor="periodStart" optional error={errors.periodStart}>
          <Input id="periodStart" name="periodStart" type="date" />
        </Field>
        <Field label="Period end" htmlFor="periodEnd" optional error={errors.periodEnd}>
          <Input id="periodEnd" name="periodEnd" type="date" />
        </Field>
      </div>

      <Alert tone="info">
        {sourceMode === "standalone"
          ? "Nothing is consolidated. You write the report from your own notes, photographs, issues and documents, and it says so - there is no source record and nothing claims to come from a previous report."
          : kind === "completion"
            ? "Issued Progress Reports are used first, with every underlying Daily Report retained as provenance. Leave the dates blank for the whole project."
            : "Only the Daily Reports you tick become the evidence, and only those are listed in the PDF as the source record. Leave the dates blank and the report covers the span of what you chose."}
      </Alert>

      <div className="flex flex-wrap gap-3">
        <StartButton />
        <Button asChild variant="secondary" size="lg"><Link href="/reports">Cancel</Link></Button>
      </div>
    </form>
  );
}
