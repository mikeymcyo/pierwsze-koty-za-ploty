"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ReportFormState } from "@/app/(app)/reports/actions";
import { DictationField } from "@/components/reports/dictation-field";
import { PlantRows, WorkforceRows } from "@/components/reports/entry-rows";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PlantEntry, Report, WorkforceEntry } from "@/types/database";

type ReportCaptureFormProps = {
  action: (state: ReportFormState, formData: FormData) => Promise<ReportFormState>;
  report: Report;
  workforce: WorkforceEntry[];
  plant: PlantEntry[];
  cancelHref: string;
  saved: boolean;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending}>
      {pending ? "Saving…" : "Save draft"}
    </Button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">{title}</h2>
        {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ReportCaptureForm({
  action,
  report,
  workforce,
  plant,
  cancelHref,
  saved,
}: ReportCaptureFormProps) {
  const [state, formAction] = useActionState<ReportFormState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {saved && !state.error ? <Alert tone="success">Draft saved.</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Section title="Report details">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Date" htmlFor="report_date" error={errors.report_date}>
            <Input
              id="report_date"
              name="report_date"
              type="date"
              defaultValue={report.report_date}
              required
            />
          </Field>

          <Field label="Weather" htmlFor="weather" optional error={errors.weather}>
            <Input
              id="weather"
              name="weather"
              defaultValue={report.weather ?? ""}
              placeholder="Dry, 12C, windy"
              autoComplete="off"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Workforce"
        hint="Carried over from your last report on this project - edit anything that has changed."
      >
        <WorkforceRows entries={workforce} />
      </Section>

      <Section title="Plant and equipment" hint="Machines and kit on site today.">
        <PlantRows entries={plant} />
      </Section>

      <Section
        title="Work completed"
        hint="Speak or type. This is kept word for word, exactly as you said it."
      >
        <DictationField
          name="raw_notes"
          label="Work completed"
          defaultValue={report.raw_notes ?? ""}
        />
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
        <SaveButton />
        <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
