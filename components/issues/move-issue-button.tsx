"use client";

import { useFormStatus } from "react-dom";

import { setIssueStatusFromReview, type IssueMoveState } from "@/app/(app)/issues/actions";
import { Button } from "@/components/ui/button";
import { useRecoverableActionState } from "@/lib/hooks/use-recoverable-action-state";

function MoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      {label}
    </Button>
  );
}

/**
 * One tap that moves an issue to open or in progress.
 *
 * A form of its own, with its own line for what went wrong. It used to be a
 * bare form whose action threw on any error, which handed the whole page to
 * the error boundary for a one-tap status change; now the error is a line
 * under the button and the screen stays exactly as it was.
 */
export function MoveIssueButton({
  issueId,
  status,
  label,
  returnPath,
}: {
  issueId: string;
  status: "open" | "in_progress";
  label: string;
  returnPath?: string;
}) {
  const [state, action] = useRecoverableActionState<IssueMoveState>(setIssueStatusFromReview, {});
  return (
    <form action={action} className="contents">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="status" value={status} />
      {returnPath ? <input type="hidden" name="returnPath" value={returnPath} /> : null}
      <MoveButton label={label} />
      {state.error ? <span className="basis-full text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
