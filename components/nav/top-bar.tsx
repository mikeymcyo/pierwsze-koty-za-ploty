import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { SettingsLink } from "@/components/nav/settings-link";

/** Compact header for phones. Desktop uses the sidebar instead. */
export function TopBar({ companyName }: { companyName: string }) {
  return (
    <header className="sticky top-0 z-30 bg-surface-sunken/90 backdrop-blur md:hidden">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4">
        <Link href="/dashboard" aria-label="SiteBoss Pro dashboard">
          <Wordmark />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink-muted">
            {companyName}
          </span>
          {/* Settings lives here rather than in the bottom bar, and carries
              the screen it was opened from: see lib/navigation.ts. */}
          <SettingsLink />
        </div>
      </div>
      <div className="h-px brand-rule" />
    </header>
  );
}
