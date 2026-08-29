"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DELETE_CONFIRMATION } from "@/lib/reports/lifecycle";

/**
 * A destructive or irreversible action, asked for twice.
 *
 * Inline rather than a modal dialog: this is used one-handed on a phone in
 * daylight, where a centred dialog is the thing people dismiss by accident.
 * The confirmation opens in place, says plainly what will happen, and puts
 * Cancel first so the thumb's resting position is the safe one.
 *
 * `requireTyping` raises the bar for issued records: a second tap is not
 * enough, the word has to be typed.
 */
export function ConfirmAction({
  action,
  trigger,
  triggerIcon,
  triggerVariant = "ghost",
  title,
  description,
  confirmLabel,
  pendingLabel,
  requireTyping = false,
  confirmVariant = "danger",
  hiddenFields = {},
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  trigger: string;
  triggerIcon?: React.ReactNode;
  triggerVariant?: "ghost" | "secondary" | "danger";
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  requireTyping?: boolean;
  confirmVariant?: "danger" | "primary";
  hiddenFields?: Record<string, string>;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const fieldId = useId();
  const ready = !requireTyping || typed.trim().toUpperCase() === DELETE_CONFIRMATION;

  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button
          type="button"
          variant={triggerVariant}
          className={triggerVariant === "ghost" ? "self-start text-ink-muted hover:text-danger" : "self-start"}
          onClick={() => setOpen(true)}
        >
          {triggerIcon}
          {trigger}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-line-strong bg-surface-muted p-4">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {requireTyping ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId} className="text-sm font-medium text-ink">
            Type {DELETE_CONFIRMATION} to confirm
          </label>
          <Input
            id={fieldId}
            name="confirmation"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={`Type ${DELETE_CONFIRMATION} to confirm`}
          />
        </div>
      ) : (
        <input type="hidden" name="confirmation" value={DELETE_CONFIRMATION} />
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={() => { setOpen(false); setTyped(""); }}>
          Cancel
        </Button>
        <ConfirmButton
          label={confirmLabel}
          pendingLabel={pendingLabel}
          disabled={!ready}
          variant={confirmVariant}
        />
      </div>
    </form>
  );
}

function ConfirmButton({
  label,
  pendingLabel,
  disabled,
  variant,
}: {
  label: string;
  pendingLabel: string;
  disabled: boolean;
  variant: "danger" | "primary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} disabled={disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
