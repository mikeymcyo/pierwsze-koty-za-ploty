"use client";

import { useActionState } from "react";

import { signUp, type AuthFormState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignupForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(signUp, {});

  if (state.message) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Your name" htmlFor="fullName" error={state.fieldErrors?.fullName}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          autoCapitalize="words"
          placeholder="Maciej Korzeniak"
          required
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
        />
      </Field>

      <Field
        label="Company"
        htmlFor="companyName"
        hint="Shown on your reports. You can change it later."
        error={state.fieldErrors?.companyName}
      >
        <Input
          id="companyName"
          name="companyName"
          autoComplete="organization"
          autoCapitalize="words"
          placeholder="Empire Interiors Ltd"
          required
          aria-invalid={Boolean(state.fieldErrors?.companyName)}
        />
      </Field>

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="you@company.co.uk"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <Field
        label="Password"
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

      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}
