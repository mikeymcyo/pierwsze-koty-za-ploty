import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The top of a screen, the same on every screen.
 *
 * Title, a line about what this is, and the actions - with a gold rule under
 * it that ties the page back to the mark. Every list and detail page uses this
 * rather than assembling its own heading, so the spacing and the type scale
 * cannot drift apart between Projects, Reports, Stores and the rest.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-4">
        <div className="min-w-0 flex-1 basis-64">
          {/* The icon belongs to the title, not to the paragraph under it: on
              a phone a two-line description used to pull the icon down beside
              it, and the title sat off to the right of nothing. */}
          <div className="flex min-w-0 items-center gap-3">
            {Icon ? (
              <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-brand-soft text-brand-ink ring-1 ring-brand/20 md:size-11 md:rounded-2xl">
                <Icon className="size-5" aria-hidden />
              </span>
            ) : null}
            <h1 className="truncate text-[26px] leading-tight font-bold tracking-tight text-ink md:text-3xl">
              {title}
            </h1>
          </div>
          {description ? (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-pretty text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {/* The gold stub against a hairline: the brand rule from the mark. */}
      <div className="h-px brand-rule" />
    </header>
  );
}
