"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Check, Sparkles, TriangleAlert } from "lucide-react";

import type {
  ApplyReviewState,
  MasterReviewState,
} from "@/app/(app)/reports/review-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  bulkAcceptableSections,
  changedSections,
  type MasterReview,
  type ReviewWarning,
} from "@/lib/reports/master-review";

function RunButton({ again }: { again: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" variant="secondary" loading={pending}>
      <Sparkles aria-hidden />
      {pending ? "Reading the whole report…" : again ? "Review again" : "Review & polish report"}
    </Button>
  );
}

function ApplyButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} disabled={count === 0}>
      <Check aria-hidden />
      {pending
        ? "Applying…"
        : count === 0
          ? "Nothing selected"
          : `Apply ${count} ${count === 1 ? "change" : "changes"}`}
    </Button>
  );
}

const SEVERITY_TONE: Record<ReviewWarning["severity"], "danger" | "info" | "neutral"> = {
  high: "danger",
  medium: "info",
  low: "neutral",
};

const WARNING_HEADING: Record<ReviewWarning["type"], string> = {
  contradiction: "Possible contradiction",
  missing: "Missing information",
  wording: "Wording",
  other: "Worth a look",
};

/**
 * The whole-report review, and what to do about it.
 *
 * Written for somebody standing on a site with an iPad, so the shape of the
 * screen is: what would change, then what to worry about, then one button.
 * Every proposed change shows the current wording above the suggested wording -
 * a person can judge two paragraphs side by side far faster than they can read
 * an explanation of the difference.
 *
 * Nothing is ticked by default. Accepting is a decision, and a screen that
 * arrives with everything selected is a screen people approve without reading.
 * "Accept all wording changes" is offered for the sections the model drafted
 * itself; a section the site manager wrote by hand is only ever ticked one at
 * a time, because that paragraph carries their judgement of what mattered.
 */
export function MasterReviewPanel({
  reviewAction,
  applyAction,
  configured,
}: {
  reviewAction: (previous: MasterReviewState, formData: FormData) => Promise<MasterReviewState>;
  applyAction: (previous: ApplyReviewState, formData: FormData) => Promise<ApplyReviewState>;
  configured: boolean;
}) {
  const [state, runReview] = useActionState<MasterReviewState, FormData>(reviewAction, {});
  const [applied, apply] = useActionState<ApplyReviewState, FormData>(applyAction, {});
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  if (!configured) return null;

  const review: MasterReview | undefined = state.review;
  const changes = review ? changedSections(review) : [];
  const warnings = review?.warnings ?? [];
  const bulk = review ? bulkAcceptableSections(review) : [];

  function toggle(sectionType: string) {
    setAccepted((was) => {
      const next = new Set(was);
      if (next.has(sectionType)) next.delete(sectionType);
      else next.add(sectionType);
      return next;
    });
  }

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
          Review &amp; polish
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Reads the whole report together - the sections, the issues, the photographs and the
          documents - and suggests where it repeats itself or reads badly. Optional: you can issue
          the report without it.
        </p>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {applied.error ? <Alert tone="danger">{applied.error}</Alert> : null}
      {applied.message ? <Alert tone="success">{applied.message}</Alert> : null}

      <form action={runReview} className="self-start">
        <RunButton again={Boolean(review)} />
      </form>

      {review ? (
        <div className="flex flex-col gap-5">
          {review.assessment ? (
            <p className="rounded-xl border border-line bg-surface-muted p-4 text-sm text-ink">
              {review.assessment}
            </p>
          ) : null}

          {warnings.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-ink">
                {warnings.length === 1 ? "1 thing to check" : `${warnings.length} things to check`}
              </h3>
              <p className="text-xs text-ink-subtle">
                These are not changed for you. Nothing here has been applied to the report.
              </p>
              <ul className="flex flex-col gap-2">
                {warnings.map((warning, index) => (
                  <li
                    key={`${warning.type}-${index}`}
                    className="flex items-start gap-3 rounded-xl border border-line p-3"
                  >
                    {warning.severity === "high" ? (
                      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={SEVERITY_TONE[warning.severity]}>
                          {WARNING_HEADING[warning.type]}
                        </Badge>
                        {warning.relatedSection ? (
                          <span className="text-xs text-ink-subtle">
                            {review.sections.find((s) => s.sectionType === warning.relatedSection)
                              ?.label ?? warning.relatedSection}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm text-ink">{warning.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {changes.length === 0 ? (
            <Alert tone="success">
              No wording changes suggested. The report reads as one document already.
            </Alert>
          ) : (
            <form action={apply} className="flex flex-col gap-4">
              <input
                type="hidden"
                name="review"
                value={JSON.stringify({
                  sections: changes.map((section) => ({
                    sectionType: section.sectionType,
                    proposedText: section.proposedText,
                  })),
                })}
              />

              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-bold text-ink">
                  {changes.length === 1
                    ? "1 suggested change"
                    : `${changes.length} suggested changes`}
                </h3>
                {bulk.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAccepted(new Set(bulk))}
                  >
                    Select the {bulk.length} AI-drafted ones
                  </Button>
                ) : null}
                {accepted.size > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAccepted(new Set())}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>

              <ul className="flex flex-col gap-4">
                {changes.map((section) => {
                  const isAccepted = accepted.has(section.sectionType);
                  return (
                    <li
                      key={section.sectionType}
                      className={`flex flex-col gap-3 rounded-xl border p-4 ${
                        isAccepted ? "border-ink bg-surface-muted" : "border-line"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-ink">{section.label}</h4>
                        {section.wasManual ? (
                          <Badge tone="info">You wrote this by hand</Badge>
                        ) : null}
                      </div>

                      {section.reason ? (
                        <p className="text-sm text-ink-muted">{section.reason}</p>
                      ) : null}

                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-xs font-bold tracking-wide text-ink-subtle uppercase">
                            Current
                          </p>
                          <p className="mt-1 text-sm whitespace-pre-wrap text-ink-muted">
                            {section.originalText || "(empty)"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold tracking-wide text-ink-subtle uppercase">
                            Suggested
                          </p>
                          <p className="mt-1 text-sm whitespace-pre-wrap text-ink">
                            {section.proposedText || "(empty - this section would be cleared)"}
                          </p>
                        </div>
                      </div>

                      {isAccepted ? (
                        <input type="hidden" name="accept" value={section.sectionType} />
                      ) : null}

                      <Button
                        type="button"
                        variant={isAccepted ? "primary" : "secondary"}
                        onClick={() => toggle(section.sectionType)}
                        className="self-start"
                      >
                        {isAccepted ? (
                          <>
                            <Check aria-hidden />
                            Accepted - tap to keep current
                          </>
                        ) : (
                          "Accept this wording"
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>

              <ApplyButton count={accepted.size} />
              <p className="text-xs text-ink-subtle">
                Only what you accept is saved, and everything stays editable afterwards.
              </p>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}
