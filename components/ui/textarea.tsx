import * as React from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-ink",
        "placeholder:text-ink-subtle",
        "focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}
