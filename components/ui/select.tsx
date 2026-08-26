import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A native <select>. On phones this opens the OS picker wheel, which is both
 * faster and more reliable with gloves than a custom dropdown.
 */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "min-h-12 w-full appearance-none rounded-xl border border-line-strong bg-surface px-4 pr-11 text-ink",
          "focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </div>
  );
}
