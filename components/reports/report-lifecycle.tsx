"use client";

import { useActionState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { deleteReport, type DeleteState } from "@/app/(app)/reports/actions";
import { reopenReport, type FinaliseState } from "@/app/(app)/reports/finalise-actions";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { reopenWarning } from "@/lib/reports/lifecycle";

/** Reopens an issued Daily Report so a correction can be made. */
export function ReopenReport({
  reportId,
  finalisedAt,
}: {
  reportId: string;
  finalisedAt: string | null;
}) {
  const reopen = reopenReport.bind(null, reportId);
  const [state, action] = useActionState<FinaliseState, FormData>(reopen, {});
  return (
    <ConfirmAction
      action={action}
      trigger="Edit final report"
      triggerIcon={<Pencil aria-hidden />}
      triggerVariant="secondary"
      title="Reopen this report for editing?"
      description={reopenWarning(finalisedAt)}
      confirmLabel="Reopen for editing"
      pendingLabel="Reopening…"
      confirmVariant="primary"
      error={state.error}
    />
  );
}

export function DeleteReport({
  reportId,
  status,
  defaultOpen,
  onCancel,
}: {
  reportId: string;
  status: "draft" | "final";
  /** Opened already, for a caller that has its own way of asking - see SwipeRow. */
  defaultOpen?: boolean;
  onCancel?: () => void;
}) {
  const remove = deleteReport.bind(null, reportId);
  const [state, action] = useActionState<DeleteState, FormData>(remove, {});
  const isFinal = status === "final";
  return (
    <ConfirmAction
      action={action}
      trigger={isFinal ? "Delete this report" : "Delete this draft"}
      triggerIcon={<Trash2 aria-hidden />}
      title={isFinal ? "Delete an issued report?" : "Delete this draft?"}
      description={
        isFinal
          ? "This removes the report, its photographs and the issued PDF for good. Anyone already sent that PDF keeps their copy, but nothing here will remain."
          : "This removes the draft and its photographs. Nothing has been issued, so nothing else is affected."
      }
      confirmLabel="Delete report"
      pendingLabel="Deleting…"
      requireTyping={isFinal}
      defaultOpen={defaultOpen}
      onCancel={onCancel}
      error={state.error}
    />
  );
}
