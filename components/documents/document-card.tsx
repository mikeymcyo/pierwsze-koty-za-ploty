"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ExternalLink, FileText, Pencil, Trash2 } from "lucide-react";

import {
  deleteDocument,
  saveDocumentMetadata,
  type DocumentFormState,
} from "@/app/(app)/documents/actions";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOCUMENT_TYPES, documentTypeLabel, formatFileSize } from "@/lib/documents/metadata";
import type { DocumentType } from "@/types/database";

export type DocumentCardData = {
  id: string;
  title: string;
  originalFilename: string;
  docType: DocumentType;
  description: string | null;
  reference: string | null;
  revision: string | null;
  documentDate: string | null;
  expiryDate: string | null;
  fileSize: number | null;
  url: string | null;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? "Saving…" : "Save details"}
    </Button>
  );
}

/**
 * One supporting document: what it is, a way to open it, and its details.
 *
 * The details stay folded away. On site the question is almost always "which
 * drawing is this and can I open it", not "what is its expiry date" - so the
 * card answers the first at a glance and keeps the eight metadata fields one
 * tap away rather than filling the screen with empty boxes.
 */
export function DocumentCard({
  document,
  editable = true,
}: {
  document: DocumentCardData;
  editable?: boolean;
}) {
  const save = saveDocumentMetadata.bind(null, document.id);
  const remove = deleteDocument.bind(null, document.id);
  const [state, action] = useActionState<DocumentFormState, FormData>(save, {});
  const [removeState, removeAction] = useActionState<DocumentFormState, FormData>(remove, {});
  const [open, setOpen] = useState(false);

  const size = formatFileSize(document.fileSize);
  const facts = [
    document.reference ? `Ref ${document.reference}` : null,
    document.revision ? `Rev ${document.revision}` : null,
    document.documentDate,
    size,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex items-start gap-3">
        <FileText className="mt-1 size-5 shrink-0 text-ink-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{document.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{documentTypeLabel(document.docType)}</Badge>
            {facts.length ? (
              <span className="text-xs text-ink-muted">{facts.join(" · ")}</span>
            ) : null}
          </p>
          {document.description ? (
            <p className="mt-2 text-sm text-ink-muted">{document.description}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {document.url ? (
          <Button asChild variant="secondary">
            <a href={document.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              Open
            </a>
          </Button>
        ) : (
          <span className="text-xs text-ink-subtle">This file could not be reached just now.</span>
        )}
        {editable ? (
          <Button type="button" variant="ghost" onClick={() => setOpen((was) => !was)}>
            <Pencil aria-hidden />
            {open ? "Hide details" : "Edit details"}
          </Button>
        ) : null}
      </div>

      {removeState.error ? <Alert tone="danger">{removeState.error}</Alert> : null}

      {editable && open ? (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <form action={action} className="flex flex-col gap-3">
            <Field label="Title" name="title" defaultValue={document.title} error={state.fieldErrors?.title} />

            <div className="flex flex-col gap-1">
              <label htmlFor={`type-${document.id}`} className="text-sm font-medium text-ink">
                Document type
              </label>
              <select
                id={`type-${document.id}`}
                name="docType"
                defaultValue={document.docType}
                className="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-ink"
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Reference" name="reference" defaultValue={document.reference ?? ""} />
              <Field label="Revision" name="revision" defaultValue={document.revision ?? ""} />
              <Field
                label="Document date"
                name="documentDate"
                type="date"
                defaultValue={document.documentDate ?? ""}
                error={state.fieldErrors?.documentDate}
              />
              <Field
                label="Expiry date"
                name="expiryDate"
                type="date"
                defaultValue={document.expiryDate ?? ""}
                error={state.fieldErrors?.expiryDate}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`description-${document.id}`} className="text-sm font-medium text-ink">
                Notes
              </label>
              <textarea
                id={`description-${document.id}`}
                name="description"
                defaultValue={document.description ?? ""}
                rows={2}
                className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-ink"
              />
            </div>

            <p className="text-xs text-ink-subtle">Uploaded as {document.originalFilename}</p>

            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            {state.saved ? <Alert tone="success">Saved.</Alert> : null}
            <SaveButton />
          </form>

          <div className="border-t border-line pt-4">
            <ConfirmAction
              action={removeAction}
              trigger="Delete this document"
              triggerIcon={<Trash2 aria-hidden />}
              title={`Delete ${document.title}?`}
              description="This removes the file from the project for good. Any issued report that references it will keep saying what it said, but the file itself will no longer open."
              confirmLabel="Delete document"
              pendingLabel="Deleting…"
              requireTyping
              error={removeState.error}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  error,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${name}-field`} className="text-sm font-medium text-ink">
        {label}
      </label>
      <Input
        id={`${name}-field`}
        name={name}
        type={type}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
