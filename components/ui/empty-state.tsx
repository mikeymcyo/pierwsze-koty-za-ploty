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
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-xl bg-surface-muted text-ink-subtle">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
