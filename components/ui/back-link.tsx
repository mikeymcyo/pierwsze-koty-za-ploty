import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The way back, in the same place on every screen.
 *
 * A link to a known parent rather than the browser's history: a site manager
 * arrives at a report from the dashboard, from the project, or from a
 * notification, and "back" should mean the same thing every time - up a level,
 * not wherever they happened to come from.
 */
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}
