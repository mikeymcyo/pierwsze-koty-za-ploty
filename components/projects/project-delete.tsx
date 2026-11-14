"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

import { deleteProject, type DeleteState } from "@/app/(app)/projects/actions";
import { ConfirmAction } from "@/components/ui/confirm-action";

/**
 * Deleting a project takes everything recorded against it with it, so the
 * confirmation says so in full rather than asking "are you sure?".
 */
export function DeleteProject({
  projectId,
  projectName,
  counts,
  defaultOpen,
  onCancel,
}: {
  projectId: string;
  projectName: string;
  /**
   * What is about to go, where the caller could count it cheaply. A list row
   * cannot - four counts per card would be a query storm - so it says what
   * kinds of thing go rather than how many.
   */
  counts?: { reports: number; summaries: number; photos: number; issues: number };
  /** Opened already, for a caller that has its own way of asking - see SwipeRow. */
  defaultOpen?: boolean;
  onCancel?: () => void;
}) {
  const remove = deleteProject.bind(null, projectId);
  const [state, action] = useActionState<DeleteState, FormData>(remove, {});

  const parts = counts
    ? [
        counts.reports === 1 ? "1 Daily Report" : `${counts.reports} Daily Reports`,
        counts.summaries === 1
          ? "1 consolidated report"
          : `${counts.summaries} consolidated reports`,
        counts.photos === 1 ? "1 photograph" : `${counts.photos} photographs`,
        counts.issues === 1 ? "1 issue" : `${counts.issues} issues`,
      ]
    : ["every report", "photograph", "issue and document"];

  return (
    <ConfirmAction
      action={action}
      trigger="Delete this project"
      triggerIcon={<Trash2 aria-hidden />}
      title={`Delete ${projectName}?`}
      description={`This permanently removes the project and everything recorded against it: ${parts.join(
        ", ",
      )}, including every issued PDF. This cannot be undone.`}
      confirmLabel="Delete project"
      pendingLabel="Deleting…"
      requireTyping
      defaultOpen={defaultOpen}
      onCancel={onCancel}
      error={state.error}
    />
  );
}
