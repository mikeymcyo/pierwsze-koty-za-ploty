import Link from "next/link";
import { Camera, FileText, Mic } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { hasSupabaseConfig } from "@/lib/env";

const STEPS = [
  {
    icon: Camera,
    title: "Photograph the site",
    body: "Shoot straight from your phone camera, add a rough caption, and tag it.",
  },
  {
    icon: Mic,
    title: "Talk for a minute",
    body: "Describe the day's work in your own words. No typing on a windy site.",
  },
  {
    icon: FileText,
    title: "Send a professional report",
    body: "A structured, client-ready PDF — built from exactly what you recorded.",
  },
];

export default function LandingPage() {
  const configured = hasSupabaseConfig();

  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="flex items-center justify-between px-5 py-6 md:px-10">
        <Wordmark />
        {configured ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        ) : null}
      </header>

      <main className="flex-1 px-5 pb-16 md:px-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
          <section className="flex flex-col gap-5 pt-6">
            <h1 className="text-4xl font-bold tracking-tight text-balance text-ink md:text-5xl">
              Site reports, finished before you leave site.
            </h1>
            <p className="max-w-xl text-lg text-pretty text-ink-muted">
              SiteBoss Pro turns your photographs and a sixty-second voice note into a
              professional progress report your client can read the same afternoon.
            </p>

            {configured ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="sm:w-auto">
                  <Link href="/signup">Create an account</Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="sm:w-auto">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            ) : (
              <Alert tone="info">
                SiteBoss Pro is not connected to Supabase yet. Copy{" "}
                <code className="font-mono">.env.example</code> to{" "}
                <code className="font-mono">.env.local</code>, add your project URL and
                anon key, run the migrations in{" "}
                <code className="font-mono">supabase/migrations</code>, then restart the
                dev server. Full steps are in the README.
              </Alert>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.title}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/20">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <h2 className="font-semibold text-ink">{step.title}</h2>
                <p className="text-sm text-ink-muted">{step.body}</p>
              </div>
            ))}
          </section>
        </div>
      </main>

      <footer className="border-t border-line px-5 py-6 text-center text-sm text-ink-subtle md:px-10">
        Generated with SiteBoss Pro
      </footer>
    </div>
  );
}
