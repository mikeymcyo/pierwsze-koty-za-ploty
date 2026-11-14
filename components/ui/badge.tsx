import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-4 font-semibold tracking-[0.01em] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-transparent bg-surface-muted text-ink-muted",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        danger: "border-transparent bg-danger-soft text-danger",
        info: "border-transparent bg-info-soft text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** A leading dot, for a chip that reports a state rather than a label. */
    dot?: boolean;
  }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
