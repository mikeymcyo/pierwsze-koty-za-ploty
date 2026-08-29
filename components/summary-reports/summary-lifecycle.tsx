"use client";

import { useActionState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { deleteSummaryReport, type DeleteState } from "@/app/(app)/summary-reports/actions";
import {
  reopenSummaryReport,
  type SummaryFinaliseState,
} from "@/app/(app)/summary-reports/finalise-actions";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { reopenWarning } from "@/lib/reports/lifecycle";

/** Reopens an issued Progress or Completion Report so a correction can be made. */
export function ReopenSummaryReport({
  reportId,
  finalisedAt,
}: {
  reportId: string;
  finalisedAt: string | null;
}) {
  const reopen = reopenSummaryReport.bind(null, reportId);
  const [state, action] = useActionState<SummaryFinaliseState, FormData>(reopen, {});
  return (
    <ConfirmAction
      action={action}
      trigger="Edit final report"
      triggerIcon={<Pencil aria-hidden />}
      triggerVariant="secondary"
      title="Reopen this report for editing?"
      description={`${reopenWarning(finalisedAt)} The Daily and Progress Reports underneath it stay exactly as they are.`}
      confirmLabel="Reopen for editing"
      pendingLabel="Reopening…"
      confirmVariant="primary"
      error={state.error}
    />
  );
}

export function DeleteSummaryReport({
  reportId,
  status,
  label,
  defaultOpen,
  onCancel,
}: {
  reportId: string;
  status: "draft" | "final";
  label: string;
  /** Opened already, for a caller that has its own way of asking - see SwipeRow. */
  defaultOpen?: boolean;
  onCancel?: () => void;
}) {
  const remove = deleteSummaryReport.bind(null, reportId);
  const [state, action] = useActionState<DeleteState, FormData>(remove, {});
  const isFinal = status === "final";
  return (
    <ConfirmAction
      action={action}
      trigger={isFinal ? `Delete this ${label}` : "Delete this draft"}
      triggerIcon={<Trash2 aria-hidden />}
      title={isFinal ? "Delete an issued report?" : "Delete this draft?"}
      description={
        isFinal
          ? "This removes the report and its issued PDF for good. The Daily Reports and photographs it was built from are left untouched - they belong to the project, not to this document."
          : "This removes the draft. The Daily Reports and photographs it was built from are left untouched."
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
