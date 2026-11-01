import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { SettingsLink } from "@/components/nav/settings-link";

/** Solid mobile brand header; the dock owns the only backdrop blur. */
export function TopBar({ companyName }: { companyName: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-surface-sunken pt-safe shadow-[0_1px_0_0_var(--color-line)] md:hidden">
      <div className="flex min-h-[72px] items-center justify-between gap-3 px-4">
        <Link href="/dashboard" aria-label="SiteBoss Pro dashboard" className="min-w-0">
          <Wordmark className="[&_svg]:size-10" />
        </Link>
        <div className="flex min-w-0 items-center gap-1.5">
          {/* Streams in after the shell - see app/(app)/layout.tsx - so the
              chip keeps its shape while the name is on its way. */}
          <span className="max-w-28 truncate border-l border-line pl-3 text-xs font-medium leading-relaxed text-ink-muted">
            {companyName}
          </span>
          {/* Settings lives here rather than in the bottom bar, and carries
              the screen it was opened from: see lib/navigation.ts. */}
          <SettingsLink />
        </div>
      </div>
    </header>
  );
}
