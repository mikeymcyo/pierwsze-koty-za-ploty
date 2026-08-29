import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[color,background-color,border-color,filter,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-ink-inverse shadow-sm shadow-brand/20 hover:bg-primary-hover",
        secondary: "border border-line-strong bg-surface text-ink hover:border-brand/40 hover:bg-surface-muted",
        ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink",
        danger: "bg-danger-strong text-white hover:brightness-110",
        brand: "bg-brand text-ink-inverse hover:bg-primary-hover",
      },
      size: {
        // Sizes are generous by default: this app is used with gloves on.
        sm: "min-h-9 px-3 text-sm [&_svg]:size-4",
        md: "min-h-12 px-5 text-base [&_svg]:size-5",
        lg: "min-h-14 px-6 text-lg [&_svg]:size-5",
        icon: "size-12 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      // A button that is working is still the button it was. Only a genuinely
      // unavailable one dims - a save that turned muddy brown mid-tap reads as
      // a failure rather than as progress.
      className={cn(
        buttonVariants({ variant, size }),
        loading && !disabled && "disabled:opacity-100",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
