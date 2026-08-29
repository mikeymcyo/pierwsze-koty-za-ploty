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
}: {
  projectId: string;
  projectName: string;
  counts: { reports: number; summaries: number; photos: number; issues: number };
}) {
  const remove = deleteProject.bind(null, projectId);
  const [state, action] = useActionState<DeleteState, FormData>(remove, {});

  const parts = [
    counts.reports === 1 ? "1 Daily Report" : `${counts.reports} Daily Reports`,
    counts.summaries === 1 ? "1 consolidated report" : `${counts.summaries} consolidated reports`,
    counts.photos === 1 ? "1 photograph" : `${counts.photos} photographs`,
    counts.issues === 1 ? "1 issue" : `${counts.issues} issues`,
  ];

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
      error={state.error}
    />
  );
}
