import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-xl border p-4 text-sm", {
  variants: {
    tone: {
      danger: "border-danger/25 bg-danger-soft text-danger",
      success: "border-success/25 bg-success-soft text-success",
      info: "border-info/25 bg-info-soft text-info",
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
