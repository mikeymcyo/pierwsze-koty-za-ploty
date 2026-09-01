"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ClipboardList, FileText, Sparkles } from "lucide-react";

import {
  addJobBriefDocument,
  addJobBriefEntry,
  adoptJobDocument,
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

/**
 * Job Context: what this job is, at the top of the screen where the work is done.
 *
 * A project IS the job, and Site Capture is where somebody stands with it. So
 * the brief, the paperwork and what the AI made of the paperwork are one strip
 * at the top of that screen - not a page of their own, not a card on the
 * project with its own uploader, not a Documents tab somebody has to find.
 *
 * Collapsed, it is four lines: what the job is in the site manager's own
 * words, each document with whether it has been read, what the AI understood,
 * and one control. Everything with a page number, a status transition, a
 * quoted-only caveat or a sentence of explanation lives behind that control.
 * A site manager came here to talk, and the strip's job is to remind them what
 * about, not to be read.
 *
 * The data underneath is unchanged and still three separate things - the brief
 * in projects.description, the context mark in job_context_documents, the
 * reading in document_extractions. What changed is that the screen stops
 * making the site manager walk between them.
 */

export type JobContextReading = {
  status: "pending" | "running" | "succeeded" | "failed" | "superseded";
  summary: string | null;
  error: string | null;
  counts: { fields: number; scopeItems: number; requirements: number };
  /** The instructed and quoted work, split, because the split is the point. */
  instructed: string[];
  proposed: string[];
};

export type JobContextDocument = {
  id: string;
  title: string;
  /** As it was named on the device, which is how somebody recognises it. */
  filename: string;
  docType: string;
  /** True where this document is job context now. */
  inScope: boolean;
  /** The current reading, or null where nobody has asked for one. */
  reading: JobContextReading | null;
};

/** The one word a collapsed strip says about a document's reading. */
function readStatus(reading: JobContextReading | null): { label: string; tone: "neutral" | "info" | "success" | "danger" } {
  if (!reading) return { label: "Not read", tone: "neutral" };
  switch (reading.status) {
    case "succeeded":
      return { label: "Read", tone: "success" };
    case "pending":
    case "running":
      return { label: "Reading…", tone: "info" };
    case "failed":
      return { label: "Could not read", tone: "danger" };
    default:
      return { label: "Not read", tone: "neutral" };
  }
}

/**
 * One line of what the AI understood, across every document that is context.
 *
 * Instructed work only. Quoted work is real and matters, and it is exactly the
 * kind of thing that must not sit in a one-line summary headed "understood",
 * where the caveat has no room to follow it. It is in the details.
 */
function understoodLine(documents: JobContextDocument[]): string | null {
  const items = documents
    .filter((document) => document.inScope && document.reading?.status === "succeeded")
    .flatMap((document) => document.reading?.instructed ?? []);
  if (items.length === 0) return null;
  return items.join(" · ");
}

function SubmitButton({
  label,
  pendingLabel,
  primary = false,
  disabled = false,
  icon,
}: {
  label: string;
  pendingLabel: string;
  primary?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={primary ? "primary" : "secondary"}
      size={primary ? "lg" : "sm"}
      className="w-full sm:w-auto"
      loading={pending}
      disabled={pending || disabled}
    >
      {pending ? null : icon}
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Every entry, oldest first, with the time it was recorded on it. */
function BriefHistory({ entries }: { entries: BriefEntry[] }) {
  return (
    <ul className="flex flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
      {entries.map((entry, index) => (
        <li key={index} className="flex gap-3 text-sm">
          <span className="w-28 shrink-0 font-mono text-xs text-ink-subtle">{entry.at ?? "—"}</span>
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
 * Remounted by the entry list growing (`key={entries.length}` at the call
 * site), which is the server confirming the append - only then is it safe to
 * empty the box.
 */
function BriefEntryForm({
  action,
  additive,
  returnTo,
}: {
  action: (formData: FormData) => void;
  additive: boolean;
  returnTo: string;
}) {
  const [text, setText] = useState("");
  const nothingToAdd = text.trim().length === 0;
  const label = additive ? "Add to the brief" : "What have you been asked to do here?";

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
        rows={3}
        placeholder={
          additive
            ? "Anything further you have been asked to do, or a change to the scope. What is already recorded stays exactly as it is."
            : "Say what the job is. Include anything that affects access or working hours."
        }
      />
      <input type="hidden" name="brief_at" value="" />
      <input type="hidden" name="return_to" value={returnTo} />
      <SubmitButton
        disabled={nothingToAdd}
        label={additive ? "Add to the brief" : "Save the brief"}
        pendingLabel="Saving…"
      />
    </form>
  );
}

/**
 * One document with everything about it, inside the details.
 *
 * Two acts stay two buttons here, because they are two decisions: marking a
 * document as context is somebody's decision about scope, and reading it is a
 * model call against the file. The one-tap path is the uploader below, where
 * both follow from the act of adding the paperwork on this screen.
 */
function DocumentDetails({
  document,
  returnTo,
  addAction,
  removeAction,
  extractAction,
}: {
  document: JobContextDocument;
  returnTo: string;
  addAction: (formData: FormData) => void;
  removeAction: (formData: FormData) => void;
  extractAction: (formData: FormData) => void;
}) {
  const reading = document.reading;
  const read = reading?.status === "succeeded";
  const status = readStatus(reading);

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{document.title}</p>
          <p className="truncate text-xs text-ink-subtle">
            {documentTypeLabel(document.docType)} · {document.filename}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={status.tone} dot={status.tone !== "neutral"}>
            {status.label}
          </Badge>
          {document.inScope ? (
            <Badge tone="success" dot>
              Job context
            </Badge>
          ) : null}
        </div>
      </div>

      {read && reading ? (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {reading.summary ? <p className="text-ink">{reading.summary}</p> : null}
          {reading.instructed.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-ink">Instructed</p>
              <ul className="list-disc pl-5 text-ink-muted">
                {reading.instructed.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {reading.proposed.length > 0 ? (
            <div>
              {/* Named as what it is. This work has not been ordered and must
                  never be reported as though it had. */}
              <p className="text-xs font-semibold text-ink">Quoted only - not instructed</p>
              <ul className="list-disc pl-5 text-ink-muted">
                {reading.proposed.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-ink-subtle">
            {reading.counts.scopeItems} scope item{reading.counts.scopeItems === 1 ? "" : "s"} ·{" "}
            {reading.counts.requirements} condition{reading.counts.requirements === 1 ? "" : "s"} ·{" "}
            {reading.counts.fields} particular{reading.counts.fields === 1 ? "" : "s"}. Every line
            was quoted from the document and checked against it. This is what the document
            asks for, not a record of work done.
          </p>
        </div>
      ) : null}

      {reading?.status === "failed" && reading.error ? (
        <p className="mt-2 text-sm text-danger">{reading.error}</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <form action={document.inScope ? removeAction : addAction} className="sm:shrink-0">
          <input type="hidden" name="documentId" value={document.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <SubmitButton
            label={document.inScope ? "Remove from job context" : "Use as job context"}
            pendingLabel={document.inScope ? "Removing…" : "Adding…"}
          />
        </form>
        <form action={extractAction} className="sm:shrink-0">
          <input type="hidden" name="documentId" value={document.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <SubmitButton
            label={read ? "Read again" : "Read this document"}
            pendingLabel="Reading the document…"
            icon={<Sparkles aria-hidden />}
          />
        </form>
      </div>
    </li>
  );
}

export function JobContext({
  projectId,
  companyId,
  description,
  documents,
  variant,
  returnTo,
}: {
  projectId: string;
  /** The company folder uploads go into. Only the capture variant uploads. */
  companyId?: string;
  description: string | null;
  documents: JobContextDocument[];
  /**
   * "capture" is the working strip with its details and controls.
   * "overview" is the same four lines, read-only, on the project.
   */
  variant: "capture" | "overview";
  /** The page to come back to after an action - this one. */
  returnTo: string;
}) {
  const [entryState, entryAction] = useActionState<JobBriefState, FormData>(
    addJobBriefEntry.bind(null, projectId),
    {},
  );
  const [addState, addAction] = useActionState<JobBriefState, FormData>(
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
  const inScope = documents.filter((document) => document.inScope);
  const understood = understoodLine(documents);
  const nothingAdded = Boolean(entryState.empty) && !entryState.error;
  const errors = [entryState.error, addState.error, removeState.error, extractState.error].filter(
    (error): error is string => Boolean(error),
  );

  // The collapsed strip. Four lines, and the same four on both screens.
  const strip = (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <ClipboardList className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold tracking-wide text-ink-muted uppercase">Job context</h2>
          {summary ? (
            // The words somebody recorded, not a paraphrase of them.
            <p className="line-clamp-2 text-sm text-ink">{summary.text}</p>
          ) : (
            <p className="text-sm text-ink-muted">Nothing recorded yet. Say what the job is.</p>
          )}
        </div>
      </div>

      {inScope.length > 0 ? (
        <ul className="flex flex-col gap-1 pl-7">
          {inScope.map((document) => {
            const status = readStatus(document.reading);
            return (
              <li key={document.id} className="flex items-center gap-2 text-sm">
                <FileText aria-hidden className="size-3.5 shrink-0 text-ink-subtle" />
                <span className="min-w-0 flex-1 truncate text-ink">{document.title}</span>
                <Badge tone={status.tone} dot={status.tone !== "neutral"}>
                  {status.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      ) : null}

      {understood ? (
        <p className="line-clamp-2 pl-7 text-sm text-ink-muted">
          <span className="font-semibold text-ink">AI understood:</span> {understood}
        </p>
      ) : null}
    </div>
  );

  if (variant === "overview") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2">
          {strip}
          <p className="pl-7 text-xs text-ink-subtle">Added to and updated on Site Capture.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {strip}

        {errors.map((error) => (
          <Alert key={error} tone="danger">
            {error}
          </Alert>
        ))}
        {nothingAdded ? (
          <p className="text-sm text-ink-subtle">Nothing was added - the brief is unchanged.</p>
        ) : null}

        {/* The one control. Everything below it is detail: the history, the
            box for the next entry, the paperwork with its caveats and page
            counts, and the uploader. */}
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {hasBrief || documents.length > 0 ? "Add or update context" : "Record the job"}
          </summary>
          <div className="mt-3 flex flex-col gap-5">
            <section className="flex flex-col gap-3">
              {hasBrief ? <BriefHistory entries={entries} /> : null}
              <BriefEntryForm
                key={entries.length}
                action={entryAction}
                additive={hasBrief}
                returnTo={returnTo}
              />
            </section>

            <section className="flex flex-col gap-3 border-t border-line pt-4">
              <div>
                <p className="text-sm font-semibold text-ink">Job documents</p>
                <p className="text-xs text-ink-subtle">
                  A purchase order, specification or drawing. Adding one here makes it job
                  context and reads it, in one go.
                </p>
              </div>

              {companyId ? (
                <DocumentUpload
                  companyId={companyId}
                  projectId={projectId}
                  label="Add job document"
                  onAttached={adoptJobDocument.bind(null, projectId, returnTo)}
                  attachedLabel="Reading the document…"
                />
              ) : null}

              {documents.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {documents.map((document) => (
                    <DocumentDetails
                      key={document.id}
                      document={document}
                      returnTo={returnTo}
                      addAction={addAction}
                      removeAction={removeAction}
                      extractAction={extractAction}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-subtle">No documents on this job yet.</p>
              )}

              <p className="text-xs text-ink-subtle">
                Job context is what the AI reads as scope. It does not put a document in a
                report or attach it to a PDF - those are chosen on the report itself.
              </p>
            </section>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
