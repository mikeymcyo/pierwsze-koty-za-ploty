import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <h1 className="text-[clamp(2.2rem,7vw,3.25rem)] leading-tight font-semibold tracking-[-0.055em]">Sign in</h1>
      <LoginForm next={next ?? "/dashboard"} />

      <p className="text-center text-sm text-ink-muted">
        New to SiteBoss Pro?{" "}
        <Link
          href="/signup"
          className="font-semibold text-ink underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
