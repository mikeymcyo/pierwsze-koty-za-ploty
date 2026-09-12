"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";

import type { ReportFormState } from "@/app/(app)/reports/actions";
import type { WriteState } from "@/app/(app)/reports/ai-actions";
import { DictationField } from "@/components/reports/dictation-field";
import { PlantRows, WorkforceRows } from "@/components/reports/entry-rows";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { describeRegeneration } from "@/lib/reports/regeneration";
import type { PlantEntry, Report, WorkforceEntry } from "@/types/database";

type ReportCaptureFormProps = {
  action: (state: ReportFormState, formData: FormData) => Promise<ReportFormState>;
  /**
   * Saves this same form and then writes the report from it. Absent where AI
   * drafting is not configured, in which case the writing box below is the
   * only way to write the report and the button is not offered.
   */
  writeAction?: (state: WriteState, formData: FormData) => Promise<WriteState>;
  /** Whether anything has been drafted yet, so the button says the right thing. */
  hasDraft: boolean;
  /**
   * The written report - the writing box with the AI's draft in it. Rendered
   * between the button that writes it and the day's details, so what SiteBoss
   * did with the notes is the next thing under the notes.
   */
  written?: React.ReactNode;
  report: Report;
  workforce: WorkforceEntry[];
  plant: PlantEntry[];
  cancelHref: string;
  saved: boolean;
};

/** Where AI drafting is not configured there is nothing to write with. */
const noWriter = async (): Promise<WriteState> => ({});

function SaveButton({ primary, writing }: { primary: boolean; writing: boolean }) {
  const { pending } = useFormStatus();
  const saving = pending && !writing;
  return (
    <Button
      type="submit"
      variant={primary ? "primary" : "secondary"}
      size="lg"
      className="w-full sm:w-auto"
      loading={saving}
      disabled={writing}
    >
      {saving ? "Saving…" : "Save draft"}
    </Button>
  );
}

/**
 * The button that writes the report from the notes above it.
 *
 * A second submit button on the same form, with its own action: it posts the
 * whole form, so the notes it reads are the notes on the screen, and nobody
 * has to save first. It is disabled rather than hidden while the notes box is
 * empty, so the flow is visible before there is anything to write.
 */
function WriteButton({
  action,
  hasDraft,
  hasNotes,
  writing,
}: {
  action: (formData: FormData) => void;
  hasDraft: boolean;
  hasNotes: boolean;
  writing: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      formAction={action}
      size="lg"
      className="w-full sm:w-auto"
      loading={writing}
      disabled={(pending && !writing) || !hasNotes}
    >
      <Sparkles aria-hidden />
      {writing ? "Writing…" : hasDraft ? "Rewrite from my notes" : "Write my report"}
    </Button>
  );
}

/**
 * A labelled block inside the form.
 *
 * An h3 rather than an h2: the report's three section headings are the h2s on
 * this screen now, and everything here sits under the first of them. See
 * lib/report-structure.ts.
 */
function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold tracking-tight text-ink">{title}</h3>
        {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The first section of a Daily Report, in the order a day is written up.
 *
 * The notes, the button that writes the report from them, the written report,
 * and only then the date, the weather, the workforce and the plant. That
 * order is the point: a person dictates, presses one button, and what
 * SiteBoss made of their words is the next thing on the screen - not three
 * cards further down past the photographs, which is where the button used to
 * be and where its result used not to be.
 *
 * The written report is its own form (components/reports/group-editor.tsx),
 * so it cannot sit inside this one. This form is `display: contents` and its
 * blocks are ordered by the surrounding column, the same device the Progress
 * curation form uses: the written report is a sibling slotted in at
 * `order-3`, between the button that wrote it and the details that follow.
 * Every field is still posted by this one form, and both buttons post all
 * of it.
 */
export function ReportCaptureForm({
  action,
  writeAction,
  hasDraft,
  written,
  report,
  workforce,
  plant,
  cancelHref,
  saved,
}: ReportCaptureFormProps) {
  const [state, formAction] = useActionState<ReportFormState, FormData>(action, {});
  const [writeState, write, writing] = useActionState<WriteState, FormData>(
    writeAction ?? noWriter,
    {},
  );
  // The notes are owned here so the button knows whether there is anything to
  // write from - dictated or typed, the same value.
  const [notes, setNotes] = useState(report.raw_notes ?? "");
  const hasNotes = Boolean(notes.trim());
  const errors = { ...(state.fieldErrors ?? {}), ...(writeState.fieldErrors ?? {}) };

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="contents">
        <div className="order-1 flex flex-col gap-4">
          {saved && !state.error ? <Alert tone="success">Draft saved.</Alert> : null}
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          {/* The one thing somebody is here to do. */}
          <Block
            title="Work completed"
            hint="Speak or type. This is kept word for word, exactly as you said it."
          >
            <DictationField
              name="raw_notes"
              label="Work completed"
              value={notes}
              onValueChange={setNotes}
              rows={6}
            />
          </Block>
        </div>

        {/* What SiteBoss does with the notes, and what it said it did. The
            outcome sits under the button and directly above the result. */}
        {writeAction ? (
          <div className="order-2 flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <WriteButton action={write} hasDraft={hasDraft} hasNotes={hasNotes} writing={writing} />
              <p className="text-sm text-ink-muted">
                {hasNotes
                  ? "Turns your notes into the written report below. Your notes stay as you said them."
                  : "Say or type what happened first."}
              </p>
            </div>
            {writeState.error ? <Alert tone="danger">{writeState.error}</Alert> : null}
            {!writeState.error && writeState.generated !== undefined ? (
              <Alert tone="success">
                {describeRegeneration({
                  generated: writeState.generated,
                  kept: writeState.kept ?? 0,
                })}
              </Alert>
            ) : null}
          </div>
        ) : null}

        {/* Inline, not folded. Every field below is printed in the issued PDF's
            appendix, and anything that reaches the client has to be on the screen
            the person signed off. It used to sit behind "Advanced details", which
            meant a report exported a workforce nobody had opened the panel to
            check. */}
        <div className="order-4 flex flex-col gap-2 border-t border-line pt-5">
          <p className="text-sm text-ink-muted">
            The date, the weather, and who and what was on site. All of it is saved with the
            report and printed in its appendix.
          </p>

          <div className="mt-4 flex flex-col gap-8">
            <Block title="Report details">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Date" htmlFor="report_date" error={errors.report_date}>
                  <Input
                    id="report_date"
                    name="report_date"
                    type="date"
                    defaultValue={report.report_date}
                    required
                  />
                </Field>

                <Field label="Weather" htmlFor="weather" optional error={errors.weather}>
                  <Input
                    id="weather"
                    name="weather"
                    defaultValue={report.weather ?? ""}
                    placeholder="Dry, 12C, windy"
                    autoComplete="off"
                  />
                </Field>
              </div>
            </Block>

            <Block
              title="Workforce"
              hint="Carried over from your last report on this project - edit anything that has changed."
            >
              <WorkforceRows entries={workforce} />
            </Block>

            <Block title="Plant and equipment" hint="Machines and kit on site today.">
              <PlantRows entries={plant} />
            </Block>
          </div>
        </div>

        <div className="order-5 flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
          <SaveButton primary={!writeAction} writing={writing} />
          <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </form>

      {/* The written report. Outside the form - it is a form of its own - and
          slotted in under the button that writes it. */}
      {written ? <div className="order-3 flex flex-col gap-3">{written}</div> : null}
    </div>
  );
}
