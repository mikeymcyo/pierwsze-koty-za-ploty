import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-control p-4 text-sm ring-1 ring-inset animate-fade", {
  variants: {
    tone: {
      danger: "bg-danger-soft text-danger ring-danger/20",
      success: "bg-success-soft text-success ring-success/20",
      info: "bg-info-soft text-info ring-info/20",
    },
  },
  defaultVariants: { tone: "info" },
});

const icons = {
  danger: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

export function Alert({
  className,
  tone = "info",
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  const Icon = icons[tone ?? "info"];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="font-medium">{children}</div>
    </div>
  );
}
