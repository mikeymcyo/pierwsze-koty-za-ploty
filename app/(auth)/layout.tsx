import Link from "next/link";

import { STRAPLINE, Wordmark } from "@/components/brand/wordmark";

/**
 * The way into SiteBoss.
 *
 * The first thing anybody sees of this product, so it is signed properly: the
 * mark, the name, and the line the company stands behind - on charcoal, with a
 * single gold rule. The screen holds one card and nothing else, because
 * somebody standing in a site cabin needs to find the password field, not
 * admire the page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-surface-sunken">
      {/* A single wash of gold behind the mark. Decoration that stays out of
          the way of the type. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(60%_60%_at_50%_50%,rgba(255,193,7,0.10),transparent_70%)]"
      />

      <header className="relative flex flex-col items-center gap-4 px-5 pt-16 pb-10">
        <Link href="/" aria-label="SiteBoss Pro home">
          <Wordmark size="lg" />
        </Link>
        <p className="text-center text-[11px] font-semibold tracking-[0.18em] text-ink-subtle">
          {STRAPLINE}
        </p>
        <div className="h-px w-24 bg-brand" />
      </header>

      <main className="relative flex-1 px-5 pb-16">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>

      <footer className="relative px-5 pb-8 text-center text-xs text-ink-subtle">
        Construction site reporting, from the site.
      </footer>
    </div>
  );
}
