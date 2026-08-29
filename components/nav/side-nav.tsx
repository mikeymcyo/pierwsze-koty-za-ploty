"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { NAV_ITEMS, isNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** The same destinations as the bottom bar, laid out as a sidebar on desktop. */
export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:flex md:flex-col">
      <div className="px-6 py-6">
        <Link href="/dashboard" aria-label="SiteBoss Pro dashboard">
          <Wordmark />
        </Link>
      </div>
      <div className="mx-6 mb-4 h-px brand-rule" />

      <nav aria-label="Primary" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                    "before:absolute before:top-1/2 before:left-0 before:h-6 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:transition-colors",
                    active
                      ? "bg-surface-muted text-ink before:bg-brand"
                      : "text-ink-muted before:bg-transparent hover:bg-surface-muted/60 hover:text-ink",
                    item.primary && !active && "text-brand-ink",
                  )}
                >
                  <Icon className="size-5" aria-hidden strokeWidth={2.25} />
                  {item.primary ? "Create report" : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
