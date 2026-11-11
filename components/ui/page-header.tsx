import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Shared work-screen title, context and actions on a solid midnight surface. */
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
    <header className={cn("work-header flex flex-col gap-5 rounded-[24px] p-5 sm:p-6", className)}>
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-info-soft text-info ring-1 ring-info/25">
              <Icon className="size-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="break-words text-balance text-[30px] leading-tight font-semibold tracking-tight text-ink md:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div> : null}
      </div>
    </header>
  );
}
