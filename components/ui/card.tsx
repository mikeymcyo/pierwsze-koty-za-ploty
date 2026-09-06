import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A card is a lit surface, not a boxed one: a soft shadow and a hairline
 * inset rather than a drawn border, so groups read by layering and space.
 * `raised` is for the one thing on a screen that has to come forward.
 */
export function Card({
  className,
  raised = false,
  ...props
}: React.ComponentProps<"div"> & { raised?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card ring-1 ring-line/70 ring-inset",
        raised ? "bg-surface-raised shadow-raised" : "bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-lg font-bold tracking-tight text-ink", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 p-5 pt-0", className)} {...props} />;
}
