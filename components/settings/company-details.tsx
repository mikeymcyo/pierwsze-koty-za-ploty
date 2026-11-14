"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateCompanyName, type CompanyDetailsState } from "@/app/(app)/profile/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  COMPANY_NAME_MAX,
  COMPANY_OWNER_ONLY,
  COMPANY_RENAME_NOTE,
} from "@/lib/company/details";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="w-full sm:w-auto sm:self-start">
      {pending ? "Saving…" : "Save company name"}
    </Button>
  );
}

/**
 * The company's own details, on the Settings screen.
 *
 * Only an owner is given the form; everybody else is shown the name and told
 * who can change it, rather than a control that would be refused. The note
 * about issued documents is above the field and not in a confirmation after
 * the fact: what somebody needs to know before renaming a company is that the
 * PDFs already sent keep the name they were sent under.
 */
export function CompanyDetails({
  companyName,
  canEdit,
}: {
  companyName: string;
  canEdit: boolean;
}) {
  const [state, action] = useActionState<CompanyDetailsState, FormData>(updateCompanyName, {});

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-muted">Company</p>
        <p className="text-base font-semibold text-ink">{companyName}</p>
        <p className="text-sm text-ink-muted">{COMPANY_OWNER_ONLY}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Company name saved.</Alert> : null}

      <Field
        label="Company name"
        htmlFor="company-name"
        hint={COMPANY_RENAME_NOTE}
      >
        <Input
          id="company-name"
          name="name"
          defaultValue={companyName}
          maxLength={COMPANY_NAME_MAX}
          autoComplete="organization"
          required
        />
      </Field>

      <SaveButton />
    </form>
  );
}
