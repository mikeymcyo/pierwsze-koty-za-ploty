"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type AuthFormState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(signIn, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

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

      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>

      <Link
        href="/forgot-password"
        className="text-center text-sm font-semibold text-ink-muted underline underline-offset-4 hover:text-ink"
      >
        Forgotten your password?
      </Link>
    </form>
  );
}
