import Link from "next/link";
import { Settings } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";

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
          {/* Profile lives here rather than in the bottom bar: see
              lib/navigation.ts. */}
          <Link
            href="/profile"
            aria-label="Settings"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <Settings className="size-5" aria-hidden />
          </Link>
        </div>
      </div>
      <div className="h-px brand-rule" />
    </header>
  );
}
