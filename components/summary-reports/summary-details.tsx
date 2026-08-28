"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveSummaryDetails, type SummaryFormState } from "@/app/(app)/summary-reports/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function SaveButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending}>{pending ? "Saving…" : "Save details"}</Button>;
}

export function SummaryDetails({
  reportId,
  title,
}: {
  reportId: string;
  title: string | null;
}) {
  const save = saveSummaryDetails.bind(null, reportId);
  const [state, action] = useActionState<SummaryFormState, FormData>(save, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Report details</h2>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Details saved.</Alert> : null}
      <Field label="Document title" htmlFor="title" optional error={errors.title}>
        <Input id="title" name="title" defaultValue={title ?? ""} />
      </Field>
      <p className="text-sm text-ink-muted">The reporting period is fixed because it defines the source evidence. Start a new draft to use different dates.</p>
      <SaveButton />
    </form>
  );
}
