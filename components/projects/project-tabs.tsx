"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { PROJECT_TABS, type ProjectTab } from "@/lib/project-tabs";
import { cn } from "@/lib/utils";

/**
 * Tabs are links carrying ?tab=, not local state, so a tab survives a refresh
 * and can be shared. Horizontally scrollable so they all fit on a phone.
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
        className="flex min-w-max gap-1 rounded-full bg-surface p-1 shadow-card ring-1 ring-line/70 ring-inset"
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
                "flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-200",
                isActive
                  ? "bg-surface-raised text-ink shadow-card ring-1 ring-line-strong/60 ring-inset"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
              {typeof count === "number" && count > 0 ? (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", isActive ? "bg-brand-soft text-brand-ink" : "bg-surface-muted text-ink-muted")}>
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
