import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

/** Compact header for phones. Desktop uses the sidebar instead. */
export function TopBar({ companyName }: { companyName: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur md:hidden">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4">
        <Link href="/dashboard" aria-label="SiteBoss Pro dashboard">
          <Wordmark />
        </Link>
        <span className="truncate text-sm font-semibold text-ink-muted">
          {companyName}
        </span>
      </div>
    </header>
  );
}
