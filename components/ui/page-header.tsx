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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/20">
              <Icon className="size-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-ink md:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {/* The gold stub against a hairline: the brand rule from the mark. */}
      <div className="h-px brand-rule" />
    </header>
  );
}
