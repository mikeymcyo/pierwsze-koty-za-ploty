import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { SettingsLink } from "@/components/nav/settings-link";

/**
 * Compact header for phones. Desktop uses the sidebar instead.
 *
 * Slim and quiet: the mark and the name on the left, the company as a small
 * chip and the gear on the right. It sits on glass so the page reads through
 * it as it scrolls, and it clears the iPhone status bar when the app is on
 * the home screen.
 */
export function TopBar({ companyName }: { companyName: string }) {
  return (
    <header className="sticky top-0 z-30 glass pt-safe shadow-[0_1px_0_0_var(--color-line)] md:hidden">
      <div className="flex min-h-[52px] items-center justify-between gap-3 px-4">
        <Link href="/dashboard" aria-label="SiteBoss Pro dashboard" className="shrink-0">
          <Wordmark />
        </Link>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate rounded-full bg-surface-muted/80 px-3 py-1 text-xs font-semibold text-ink-muted">
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
