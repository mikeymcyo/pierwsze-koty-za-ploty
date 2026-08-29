"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MOBILE_NAV_ITEMS, isNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Primary navigation on phones: a fixed bottom bar with a raised centre action.
 * Every target is at least 56px tall so it can be hit with gloves on.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;

          if (item.primary) {
            return (
              <li key={item.href} className="flex flex-1 justify-center">
                <Link
                  href={item.href}
                  className="-mt-5 flex flex-col items-center gap-1 px-2 pb-2"
                >
                  <span
                    className={cn(
                      "grid size-14 place-items-center rounded-2xl bg-brand text-ink-inverse shadow-lg shadow-brand/25 transition-transform active:scale-95",
                    )}
                  >
                    <Icon className="size-7" aria-hidden strokeWidth={2.5} />
                  </span>
                  <span className="text-[11px] font-semibold text-ink-muted">{item.label}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                  active ? "text-brand" : "text-ink-subtle",
                )}
              >
                <Icon className="size-6" aria-hidden strokeWidth={active ? 2.5 : 2} />
                <span className="text-[11px] font-semibold">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
