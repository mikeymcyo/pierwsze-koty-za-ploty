import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Label + control + hint/error, wired up for screen readers. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-ink-subtle">(optional)</span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
