"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { BookOpenCheck, ClipboardList, FileText, Plus, Sparkles } from "lucide-react";

import {
  addJobBriefDocument,
  addJobBriefEntry,
  extractJobDocument,
  removeJobBriefDocument,
  type JobBriefState,
} from "@/app/(app)/projects/brief-actions";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DictationField } from "@/components/reports/dictation-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { documentTypeLabel } from "@/lib/documents/metadata";
import { briefSummary, parseJobBrief, type BriefEntry } from "@/lib/projects/job-brief";

function AddButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full sm:w-auto"
      loading={pending}
      disabled={pending || disabled}
    >
      {pending ? "Adding…" : label}
    </Button>
  );
}

/** Every entry, oldest first, with the time it was recorded on it. */
function BriefHistory({ entries }: { entries: BriefEntry[] }) {
  return (
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
  );
}

/**
 * The box for the NEXT entry, and only ever the next one.
 *
 * Where a brief already exists this box is additive and says so - in its
 * heading, in its placeholder and on its button. An empty box under a recorded
 * brief means "nothing to add yet", never "this job has no brief", and the
 * button is simply unavailable until there is something to add rather than
 * refusing the tap afterwards with a warning that says the wrong thing.
 *
 * Remounted by the entry list growing (`key={entries.length}` at the call
 * site), which is the server confirming the append - only then is it safe to
 * empty the box.
 */
function BriefEntryForm({
  action,
  additive,
  rows,
}: {
  action: (formData: FormData) => void;
  additive: boolean;
  rows: number;
}) {
  const [text, setText] = useState("");
  const nothingToAdd = text.trim().length === 0;
  const label = additive ? "Add another scope update or instruction" : "Job brief";

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="brief_text" className="text-sm font-semibold text-ink">
        {label}
      </label>
      <DictationField
        name="brief_text"
        label={label}
        value={text}
        onValueChange={setText}
        rows={rows}
        placeholder={
          additive
            ? "Anything further you have been asked to do, or a change to the scope. What is already recorded stays exactly as it is."
            : "What have you been asked to do here? Include anything that affects access or working hours."
        }
      />
      <input type="hidden" name="brief_at" value="" />
      <AddButton
        disabled={nothingToAdd}
        label={additive ? "Add to the brief" : "Save job brief"}
      />
    </form>
  );
}

/** What the AI made of one document, in the few lines a card has room for. */
export type BriefExtraction = {
  status: "pending" | "running" | "succeeded" | "failed" | "superseded";
  summary: string | null;
  error: string | null;
  counts: { fields: number; scopeItems: number; requirements: number };
  /** The instructed and proposed work, so the split is visible without a tap. */
  instructed: string[];
  proposed: string[];
};

export type BriefDocument = {
  id: string;
  title: string;
  /** As it was named on the device, which is how somebody recognises it. */
  filename: string;
  docType: string;
  /** True where this document is already part of the job scope. */
  inScope: boolean;
  /** The current reading, or null where nobody has asked for one. */
  extraction: BriefExtraction | null;
};

function ActionButton({
  label,
  pendingLabel,
  icon,
}: {
  label: string;
  pendingLabel: string;
  icon: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      className="w-full sm:w-auto"
      loading={pending}
      disabled={pending}
    >
      {pending ? null : icon}
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * What the AI understood, in the space a card has.
 *
 * Every line here was quoted out of the document and the quote was checked
 * against the document before it was stored, so this is the paperwork's own
 * words rather than a machine's impression of them. The instructed and quoted
 * work are separated on the face of it, because that is the distinction a site
 * manager needs to see without opening anything: a priced option nobody
 * ordered sitting in a list headed "scope" is how quoted work gets done.
 */
function UnderstoodPanel({ extraction }: { extraction: BriefExtraction }) {
  const { counts } = extraction;
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-ink-muted uppercase">
        <BookOpenCheck aria-hidden className="size-3.5" />
        AI understood this job
      </p>

      {extraction.summary ? <p className="text-sm text-ink">{extraction.summary}</p> : null}

      {extraction.instructed.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-ink">Instructed</p>
          <ul className="list-disc pl-5 text-sm text-ink-muted">
            {extraction.instructed.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {extraction.proposed.length > 0 ? (
        <div>
          {/* Named as what it is. "Quoted, not instructed" is the whole point:
              this work has not been ordered and must never be reported as
              though it had. */}
          <p className="text-xs font-semibold text-ink">Quoted only - not instructed</p>
          <ul className="list-disc pl-5 text-sm text-ink-muted">
            {extraction.proposed.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-ink-subtle">
        {counts.scopeItems} scope item{counts.scopeItems === 1 ? "" : "s"} · {counts.requirements}{" "}
        condition{counts.requirements === 1 ? "" : "s"} · {counts.fields} particular
        {counts.fields === 1 ? "" : "s"}. Every line was quoted from the document and checked
        against it. This is what the document asks for, not a record of work done.
      </p>
    </div>
  );
}

/** The one line that says where this document's reading has got to. */
function ExtractionBadge({ extraction }: { extraction: BriefExtraction | null }) {
  if (!extraction) return <Badge tone="neutral">Not read</Badge>;
  if (extraction.status === "running" || extraction.status === "pending") {
    return (
      <Badge tone="info" dot>
        Reading…
      </Badge>
    );
  }
  if (extraction.status === "failed") return <Badge tone="danger">Could not read</Badge>;
  if (extraction.status === "succeeded") {
    return (
      <Badge tone="success" dot>
        Read
      </Badge>
    );
  }
  return <Badge tone="neutral">Not read</Badge>;
}

/**
 * One document on the job, and whether the AI is allowed to read it.
 *
 * Uploading a document does not make it scope, so a document that is not job
 * context is not shown as a problem - it is shown as what it is, with the one
 * button that would change it. The two acts this button is NOT are named
 * underneath the list, because on a phone the button is all anybody reads.
 */
function JobDocumentRow({
  document,
  addAction,
  removeAction,
  extractAction,
}: {
  document: BriefDocument;
  addAction: (formData: FormData) => void;
  removeAction: (formData: FormData) => void;
  extractAction: (formData: FormData) => void;
}) {
  const extraction = document.extraction;
  const read = extraction?.status === "succeeded";

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FileText aria-hidden className="size-4 shrink-0 text-ink-subtle" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{document.title}</p>
          <p className="truncate text-xs text-ink-subtle">
            {documentTypeLabel(document.docType)} · {document.filename}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <ExtractionBadge extraction={extraction} />
          {document.inScope ? (
            <Badge tone="success" dot>
              Job context
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Two acts, never one button. Marking a document as job context is
          somebody's decision about scope; reading it is a model call against
          the file. A document can be context and unread, or read and not
          context, and both are ordinary states. */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {document.inScope ? (
          <form action={removeAction} className="sm:shrink-0">
            <input type="hidden" name="documentId" value={document.id} />
            <ActionButton
              label="Remove from job context"
              pendingLabel="Removing…"
              icon={null}
            />
          </form>
        ) : (
          <form action={addAction} className="sm:shrink-0">
            <input type="hidden" name="documentId" value={document.id} />
            <ActionButton label="Use as job context" pendingLabel="Adding…" icon={null} />
          </form>
        )}

        <form action={extractAction} className="sm:shrink-0">
          <input type="hidden" name="documentId" value={document.id} />
          <ActionButton
            label={read ? "Read again" : "Extract job context"}
            pendingLabel="Reading the document…"
            icon={<Sparkles aria-hidden />}
          />
        </form>
      </div>

      {extraction?.status === "failed" && extraction.error ? (
        <p className="mt-2 text-sm text-danger">{extraction.error}</p>
      ) : null}

      {read && extraction ? <UnderstoodPanel extraction={extraction} /> : null}

      {read && !document.inScope ? (
        <p className="mt-2 text-xs text-ink-subtle">
          Read, but not job context yet - the AI will not use it until you say so.
        </p>
      ) : null}
    </li>
  );
}

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
 *
 * One brief already recorded means the job HAS a brief - a sentence dictated
 * in the van, a document brought into the scope, or a plain description
 * written before any of this existed. Nothing on this screen may suggest
 * otherwise while one is showing directly above it.
 */
export function JobBrief({
  projectId,
  companyId,
  description,
  documents,
  /** A summary and a disclosure, for the Site Capture screen. */
  compact = false,
}: {
  projectId: string;
  /**
   * The company folder uploads go into. Absent on Site Capture, which links
   * to this card rather than carrying a second uploader of its own.
   */
  companyId?: string;
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
  const [removeState, removeAction] = useActionState<JobBriefState, FormData>(
    removeJobBriefDocument.bind(null, projectId),
    {},
  );
  const [extractState, extractAction] = useActionState<JobBriefState, FormData>(
    extractJobDocument.bind(null, projectId),
    {},
  );
  const entries = parseJobBrief(description);
  const hasBrief = entries.length > 0;
  const summary = briefSummary(description);

  // An empty box is only ever a missing brief where there is genuinely no
  // brief. The server decides that, having read the project; here it is just
  // not coloured as a fault when it was not one.
  const nothingAdded = Boolean(state.empty) && !state.error;

  if (compact) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            {/* No gold plate here. Site Capture has one primary action - the
                microphone below - and a second brand-coloured chip above it
                would compete with it. */}
            <ClipboardList className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                Job brief
              </h2>
              {summary ? (
                // The words somebody recorded, not a paraphrase of them. Two
                // lines at most: this screen exists for the microphone below
                // it, and the whole history is one tap away.
                <p className="line-clamp-2 text-sm text-ink">{summary.text}</p>
              ) : (
                <p className="text-sm text-ink-muted">
                  Nothing recorded yet. Say what you have been asked to do.
                </p>
              )}
            </div>
          </div>

          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {nothingAdded ? (
            <p className="text-sm text-ink-subtle">
              Nothing was added - the brief already recorded is unchanged.
            </p>
          ) : null}

          <details className="rounded-xl border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {hasBrief
                ? `Add to the brief · ${summary?.entries ?? entries.length} recorded`
                : "Record the job brief"}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {hasBrief ? <BriefHistory entries={entries} /> : null}
              <BriefEntryForm key={entries.length} action={action} additive={hasBrief} rows={3} />
              <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
                <Link href={`/projects/${projectId}`}>
                  <Plus aria-hidden />
                  Add a job document
                </Link>
              </Button>
            </div>
          </details>
        </CardContent>
      </Card>
    );
  }

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

        {hasBrief ? (
          <BriefHistory entries={entries} />
        ) : (
          <p className="text-sm text-ink-subtle">
            Nothing recorded yet. Say what you have been asked to do.
          </p>
        )}

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {nothingAdded ? (
          <p className="text-sm text-ink-subtle">
            Nothing was added - the brief already recorded is unchanged.
          </p>
        ) : null}
        {documentState.error ? <Alert tone="danger">{documentState.error}</Alert> : null}
        {removeState.error ? <Alert tone="danger">{removeState.error}</Alert> : null}
        {/* A failed reading is also written onto the document's own row, so a
            reload still shows it. This is the immediate answer to the tap. */}
        {extractState.error ? <Alert tone="danger">{extractState.error}</Alert> : null}

        <BriefEntryForm key={entries.length} action={action} additive={hasBrief} rows={4} />

        {/* The paperwork, where the card that talks about it is.
            
            This used to tell somebody to "upload a purchase order below" and
            then offer them nothing to do it with - the uploader was on another
            tab. The upload is here now, and it is the SAME uploader the
            Documents tab uses, writing to the same bucket and the same table:
            a job document is an ordinary project document, and a second
            storage flow for it would be a second place for a file to go
            missing.

            A document is job scope because somebody said so - never because it
            was uploaded. So an upload lands in the list below unmarked, and
            "Use as job context" is a separate tap. It does not reference the
            document in any report and does not append it to any PDF; those are
            chosen on the report itself. */}
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div>
            <p className="text-sm font-semibold text-ink">Job documents</p>
            <p className="text-xs text-ink-subtle">
              A purchase order, specification or drawing. Uploading one does not make it job
              context, and marking it does not read it - both are a tap of their own.
            </p>
          </div>

          {documents.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {documents.map((document) => (
                <JobDocumentRow
                  key={document.id}
                  document={document}
                  addAction={documentAction}
                  removeAction={removeAction}
                  extractAction={extractAction}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-subtle">No documents on this job yet.</p>
          )}

          {companyId ? (
            <DocumentUpload
              companyId={companyId}
              projectId={projectId}
              label="Add job document"
            />
          ) : (
            <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
              <Link href={`/projects/${projectId}`}>
                <Plus aria-hidden />
                Add a job document
              </Link>
            </Button>
          )}

          <p className="text-xs text-ink-subtle">
            &ldquo;Use as job context&rdquo; lets the AI read the document as scope, and
            &ldquo;Extract job context&rdquo; is what actually reads it. Neither puts it in a
            report or attaches it to a PDF - those are chosen on the report itself.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
