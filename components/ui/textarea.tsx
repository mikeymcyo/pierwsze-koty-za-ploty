import * as React from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-control border border-line-strong/70 bg-surface-sunken/70 px-4 py-3 leading-relaxed text-ink shadow-[inset_0_1px_0_0_rgb(0_0_0/0.25)]",
        "placeholder:text-ink-subtle",
        "transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}
