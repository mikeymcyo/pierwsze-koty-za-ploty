"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { PROJECT_TABS, type ProjectTab } from "@/lib/project-tabs";
import { cn } from "@/lib/utils";

/**
 * Tabs are links carrying ?tab=, not local state, so a tab survives a refresh
 * and can be shared. Horizontally scrollable so all four fit on a phone.
 */
export function ProjectTabs({
  active,
  counts,
}: {
  active: ProjectTab;
  counts?: Partial<Record<ProjectTab, number>>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <nav
        aria-label="Project sections"
        className="flex min-w-max gap-1 border-b border-line"
      >
        {PROJECT_TABS.map((tab) => {
          const params = new URLSearchParams(searchParams);
          params.set("tab", tab.key);
          const isActive = tab.key === active;
          const count = counts?.[tab.key];

          return (
            <Link
              key={tab.key}
              href={`${pathname}?${params.toString()}`}
              aria-current={isActive ? "page" : undefined}
              scroll={false}
              className={cn(
                "flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors",
                isActive
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
              {typeof count === "number" && count > 0 ? (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
