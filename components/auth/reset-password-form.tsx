"use client";

import Link from "next/link";
import { useActionState } from "react";

import { updatePassword, type AuthFormState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(updatePassword, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <div className="flex flex-col gap-3">
          <Alert tone="danger">{state.error}</Alert>
          <Link
            href="/forgot-password"
            className="text-center text-sm font-semibold text-ink underline underline-offset-4"
          >
            Request a new reset link
          </Link>
        </div>
      ) : null}

      <Field
        label="New password"
        htmlFor="password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        error={state.fieldErrors?.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
        />
      </Field>

      <SubmitButton pendingLabel="Saving…">Save new password</SubmitButton>
    </form>
  );
}
