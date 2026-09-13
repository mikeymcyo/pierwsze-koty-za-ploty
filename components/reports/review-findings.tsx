"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Check, Plus, TriangleAlert } from "lucide-react";

import {
  createIssue,
  resolveIssue,
  setIssueStatusFromReview,
  type IssueFormState,
  type IssueMoveState,
  type ResolveIssueState,
} from "@/app/(app)/issues/actions";
import type { ReviewIssueContext } from "@/app/(app)/reports/review-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_TONES,
  isResolvedStatus,
} from "@/lib/issues/metadata";
import type { IssueStatus } from "@/types/database";
import type { ReviewIssue, ReviewWarning } from "@/lib/reports/master-review";
import { type FindingOutcome, WARNING_HEADING } from "@/lib/reports/master-review";

const SEVERITY_TONE: Record<ReviewWarning["severity"], "danger" | "info" | "neutral"> = {
  high: "danger",
  medium: "info",
  low: "neutral",
};

const control =
  "min-h-11 w-full rounded-control bg-surface px-3 text-sm text-ink ring-1 ring-line-strong/70 ring-inset placeholder:text-ink-subtle focus:ring-2 focus:ring-brand/60 focus:outline-none";

/** Today as the phone sees it, for the resolved-on default. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function Pending({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending}>
      <Check aria-hidden />
      {pending ? busy : label}
    </Button>
  );
}

/**
 * Moves the finding's issue to in progress, or back to open. One tap, the
 * same action the issue list uses, and the finding is cleared only once the
 * server says the issue moved.
 */
function MoveIssue({
  issue,
  status,
  label,
  returnPath,
  onMoved,
}: {
  issue: ReviewIssue;
  status: "open" | "in_progress";
  label: string;
  returnPath: string;
  onMoved: (outcome: FindingOutcome) => void;
}) {
  // The outcome is reported from inside the action, once the server has
  // answered - never during a render, which is the one place a parent must
  // not be told anything.
  const [state, action] = useActionState<IssueMoveState, FormData>(
    async (previous, formData) => {
      const result = await setIssueStatusFromReview(previous, formData);
      if (result.status) onMoved(result.status === "in_progress" ? "in_progress" : "reopened");
      return result;
    },
    {},
  );
  return (
    <form action={action} className="contents">
      <input type="hidden" name="issueId" value={issue.id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <MoveButton label={label} />
      {state.error ? <span className="basis-full text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}

function MoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" loading={pending}>
      {label}
    </Button>
  );
}

/**
 * Resolve the finding's issue where it is found.
 *
 * The note is optional here - the finding already says what the review saw -
 * and the date defaults to today. It goes through resolveIssue, the same
 * action as the issue list, so the record and its history are the same
 * whichever screen it was pressed on. Nothing happens until Confirm.
 */
function ResolveFromFinding({
  issue,
  returnPath,
  onResolved,
  onCancel,
}: {
  issue: ReviewIssue;
  returnPath: string;
  onResolved: () => void;
  onCancel: () => void;
}) {
  const [state, action] = useActionState<ResolveIssueState, FormData>(
    async (previous, formData) => {
      const result = await resolveIssue(previous, formData);
      if (result.resolved) onResolved();
      return result;
    },
    {},
  );
  const id = useId();
  return (
    <form
      action={action}
      className="flex w-full flex-col gap-3 rounded-control bg-surface-sunken/60 p-3 ring-1 ring-line/70 ring-inset"
    >
      <input type="hidden" name="issueId" value={issue.id} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-note`} className="text-xs font-semibold text-ink-muted">
            What was done <span className="font-normal text-ink-subtle">(optional)</span>
          </label>
          <input
            id={`${id}-note`}
            name="note"
            placeholder="Inserts fitted; section completed."
            maxLength={500}
            className={control}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-date`} className="text-xs font-semibold text-ink-muted">
            Resolved on
          </label>
          <input
            id={`${id}-date`}
            name="resolvedOn"
            type="date"
            defaultValue={today()}
            max={today()}
            className={control}
          />
        </div>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Pending label="Confirm resolved" busy="Resolving…" />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The controls for a finding about a recorded issue. */
function IssueControls({
  issue,
  returnPath,
  onHandled,
}: {
  issue: ReviewIssue;
  returnPath: string;
  onHandled: (outcome: FindingOutcome) => void;
}) {
  const [resolving, setResolving] = useState(false);
  const status = issue.status as IssueStatus;
  const resolved = isResolvedStatus(status);

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line/70 pt-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-ink">{issue.title}</span>
        <Badge tone={ISSUE_STATUS_TONES[status] ?? "neutral"}>
          {ISSUE_STATUS_LABELS[status] ?? issue.status}
        </Badge>
      </p>
      {resolving ? (
        <ResolveFromFinding
          issue={issue}
          returnPath={returnPath}
          onResolved={() => onHandled("resolved")}
          onCancel={() => setResolving(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* Leaving it as it is is a decision too: the finding is cleared and
              nothing about the issue changes. */}
          <Button type="button" size="sm" variant="ghost" onClick={() => onHandled("kept")}>
            {resolved ? "Keep resolved" : status === "in_progress" ? "Keep in progress" : "Keep open"}
          </Button>
          {resolved ? (
            <MoveIssue issue={issue} status="open" label="Reopen" returnPath={returnPath} onMoved={onHandled} />
          ) : (
            <>
              {status !== "in_progress" ? (
                <MoveIssue
                  issue={issue}
                  status="in_progress"
                  label="In progress"
                  returnPath={returnPath}
                  onMoved={onHandled}
                />
              ) : null}
              <Button type="button" size="sm" onClick={() => setResolving(true)}>
                <Check aria-hidden />
                Resolve
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The controls for a finding that looks like an issue nobody has raised.
 *
 * Create issue goes through createIssue - the same record, the same
 * lifecycle, raised against this project and, on a Daily, this report - with
 * the title on offer and a priority to pick. "Not a live issue" clears the
 * finding and raises nothing. The reviewer only ever suggests.
 */
function NewIssueControls({
  title,
  context,
  onHandled,
}: {
  title: string;
  context: ReviewIssueContext;
  onHandled: (outcome: FindingOutcome) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<IssueFormState, FormData>(
    async (previous, formData) => {
      const result = await createIssue(previous, formData);
      if (result.created) onHandled("created");
      return result;
    },
    {},
  );
  const id = useId();
  const errors = state.fieldErrors ?? {};

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line/70 pt-3">
      {open ? (
        <form
          action={action}
          className="flex w-full flex-col gap-3 rounded-control bg-surface-sunken/60 p-3 ring-1 ring-line/70 ring-inset"
        >
          <input type="hidden" name="projectId" value={context.projectId} />
          {context.reportId ? <input type="hidden" name="reportId" value={context.reportId} /> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-title`} className="text-xs font-semibold text-ink-muted">
                Issue
              </label>
              <input id={`${id}-title`} name="title" defaultValue={title} maxLength={200} required className={control} />
              {errors.title ? <span className="text-xs text-danger">{errors.title}</span> : null}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-priority`} className="text-xs font-semibold text-ink-muted">
                Priority
              </label>
              <select id={`${id}-priority`} name="priority" defaultValue="medium" className={control}>
                {ISSUE_PRIORITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Pending label="Raise issue" busy="Raising…" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            <Plus aria-hidden />
            Create issue
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onHandled("ignored")}>
            Not a live issue
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * One finding from the whole-report review, with what can be done about it
 * right here.
 *
 * A finding about a recorded issue carries that issue's own controls - keep,
 * in progress, resolve - through the same actions as the issue list, so the
 * person never leaves the review to fix what it found. A finding that reads
 * as a new issue offers to raise one, or to be told it is not live. Every
 * outcome is a person's tap; the reviewer decides nothing.
 */
export function ReviewFinding({
  warning,
  sectionLabel,
  context,
  onHandled,
}: {
  warning: ReviewWarning;
  sectionLabel: string | null;
  context: ReviewIssueContext | undefined;
  onHandled: (outcome: FindingOutcome) => void;
}) {
  const issue = warning.relatedIssueId
    ? context?.issues.find((candidate) => candidate.id === warning.relatedIssueId)
    : undefined;

  return (
    <li className="flex items-start gap-3 rounded-xl border border-line p-3">
      {warning.severity === "high" ? (
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={SEVERITY_TONE[warning.severity]}>{WARNING_HEADING[warning.type]}</Badge>
          {sectionLabel ? <span className="text-xs text-ink-subtle">{sectionLabel}</span> : null}
        </span>
        <span className="mt-1 block text-sm text-ink">{warning.message}</span>

        {issue && context ? (
          <IssueControls issue={issue} returnPath={context.returnPath} onHandled={onHandled} />
        ) : warning.suggestedIssue && context ? (
          <NewIssueControls title={warning.suggestedIssue} context={context} onHandled={onHandled} />
        ) : null}
      </div>
    </li>
  );
}
