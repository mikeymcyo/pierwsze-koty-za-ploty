import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-card bg-surface/70 px-6 py-12 text-center ring-1 ring-line/70 ring-inset",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand-ink ring-1 ring-brand/20">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
