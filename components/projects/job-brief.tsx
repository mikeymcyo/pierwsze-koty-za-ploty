"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ClipboardList, FileText, Plus } from "lucide-react";

import {
  addJobBriefDocument,
  addJobBriefEntry,
  type JobBriefState,
} from "@/app/(app)/projects/brief-actions";
import { DictationField } from "@/components/reports/dictation-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseJobBrief } from "@/lib/projects/job-brief";

function AddButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending} disabled={pending}>
      {pending ? "Adding…" : label}
    </Button>
  );
}

export type BriefDocument = {
  id: string;
  title: string;
  docType: string;
  /** True where this document is already part of the job scope. */
  inScope: boolean;
};

/**
 * What the job is supposed to be, said before or during the work.
 *
 * A site manager is sent to repair a leaking bakery sink and rectify the
 * warehouse doors. That is the job, and it arrives as a sentence in a van at
 * seven in the morning - not as a purchase order. So this takes a spoken or
 * typed brief on its own, and a document that arrives later is added to it
 * rather than replacing it.
 *
 * Append-only, and visibly so: every entry keeps the time it was recorded, so
 * a reader can always see that the works were described before they were
 * formally instructed. Nothing here writes to a report, references a document
 * in one, or appends anything to a PDF - those are three other acts on three
 * other screens.
 */
export function JobBrief({
  projectId,
  description,
  documents,
  /** Fewer words and no document picker, for the Site Capture screen. */
  compact = false,
}: {
  projectId: string;
  description: string | null;
  documents: BriefDocument[];
  compact?: boolean;
}) {
  const [state, action] = useActionState<JobBriefState, FormData>(
    addJobBriefEntry.bind(null, projectId),
    {},
  );
  const [documentState, documentAction] = useActionState<JobBriefState, FormData>(
    addJobBriefDocument.bind(null, projectId),
    {},
  );
  const entries = parseJobBrief(description);
  const available = documents.filter((document) => !document.inScope);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft">
            <ClipboardList className="size-5 text-brand" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-ink">Job brief / scope</h2>
            <p className="text-sm text-ink-muted">
              What this job was sent out to do. Say it before you start, or add to it as you
              go - a purchase order is not needed and can be added later.
            </p>
          </div>
        </div>

        {entries.length > 0 ? (
          <ul className="flex flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
            {entries.map((entry, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 font-mono text-xs text-ink-subtle">
                  {entry.at ?? "—"}
                </span>
                <span className="min-w-0 text-ink-muted">
                  {entry.documentId ? (
                    <span className="flex items-center gap-1.5">
                      <FileText aria-hidden className="size-3.5 shrink-0" />
                      {entry.text.replace(/\s*\(doc:[0-9a-f-]{36}\)/i, "")}
                    </span>
                  ) : (
                    entry.text
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-subtle">
            Nothing recorded yet. Say what you have been asked to do.
          </p>
        )}

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {documentState.error ? <Alert tone="danger">{documentState.error}</Alert> : null}

        <form action={action} className="flex flex-col gap-3">
          <DictationField
            // Cleared by the entry list growing: the server confirmed it, and
            // only then is it safe to empty the box.
            key={entries.length}
            name="brief_text"
            label="Job brief"
            defaultValue=""
            rows={compact ? 3 : 4}
            placeholder="What have you been asked to do here? Include anything that affects access or working hours."
          />
          <input type="hidden" name="brief_at" value="" />
          <AddButton label={entries.length > 0 ? "Add to the brief" : "Save job brief"} />
        </form>

        {/* A document is job scope because somebody said so - never because it
            was uploaded. Adding one here does not reference it in any report
            and does not append it to any PDF. */}
        {compact ? (
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href={`/projects/${projectId}`}>
              <Plus aria-hidden />
              Add a job document
            </Link>
          </Button>
        ) : available.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Add a job document to the scope</p>
            <ul className="flex flex-col gap-2">
              {available.map((document) => (
                <li key={document.id}>
                  <form
                    action={documentAction}
                    className="flex items-center gap-3 rounded-xl border border-line p-3"
                  >
                    <input type="hidden" name="documentId" value={document.id} />
                    <FileText aria-hidden className="size-4 shrink-0 text-ink-subtle" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {document.title}
                    </span>
                    <Button type="submit" variant="secondary" size="sm">
                      Use as job context
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-subtle">
              This lets the AI read the document as scope. It does not put it in a report or
              attach it to a PDF - those are chosen on the report itself.
            </p>
          </div>
        ) : documents.length > 0 ? (
          <p className="text-xs text-ink-subtle">
            Every document on this project is already part of the job scope.
          </p>
        ) : (
          <p className="text-xs text-ink-subtle">
            Upload a purchase order, specification or drawing below and it can be added to the
            scope here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
