import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "min-h-(--ui-control-min) w-full rounded-xl border border-line-strong bg-surface-sunken px-4 text-ink",
        "placeholder:text-ink-subtle",
        // Gold on focus: on charcoal a white ring is hard to separate from the
        // text inside it, and this is used with gloves on.
        "transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}
