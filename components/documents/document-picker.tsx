"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ExternalLink } from "lucide-react";

import type { DocumentFormState } from "@/app/(app)/documents/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { documentTypeLabel } from "@/lib/documents/metadata";
import type { DocumentType } from "@/types/database";

export type PickableDocument = {
  id: string;
  title: string;
  docType: DocumentType;
  reference: string | null;
  revision: string | null;
  url: string | null;
  selected: boolean;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? "Saving…" : "Save selection"}
    </Button>
  );
}

/**
 * Which of the project's documents this report is issued against.
 *
 * Ticking references a document the project already holds; unticking removes
 * this report's reference and leaves the project's copy, its details and every
 * other report's reference exactly where they were. That is the whole reason
 * documents live on the project rather than on the report: the same RAMS is
 * referenced by thirty daily reports and uploaded once.
 *
 * Rows are large touch targets - this is ticked with a gloved thumb.
 */
export function DocumentPicker({
  action,
  documents,
}: {
  action: (previous: DocumentFormState, formData: FormData) => Promise<DocumentFormState>;
  documents: PickableDocument[];
}) {
  const [state, formAction] = useActionState<DocumentFormState, FormData>(action, {});

  if (documents.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        This project has no documents yet. Upload one above, or add them from the project&apos;s
        Documents tab.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Selection saved.</Alert> : null}

      <ul className="flex flex-col gap-2">
        {documents.map((document) => (
          <li key={document.id} className="rounded-xl border border-line">
            <div className="flex items-start gap-3 p-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="documentId"
                  value={document.id}
                  defaultChecked={document.selected}
                  className="mt-1 size-5 shrink-0 accent-black"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{document.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{documentTypeLabel(document.docType)}</Badge>
                    {document.reference || document.revision ? (
                      <span className="text-xs text-ink-muted">
                        {[
                          document.reference ? `Ref ${document.reference}` : null,
                          document.revision ? `Rev ${document.revision}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </span>
              </label>
              {document.url ? (
                <a
                  href={document.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-2 text-ink-muted hover:text-ink"
                  aria-label={`Open ${document.title}`}
                >
                  <ExternalLink className="size-5" aria-hidden />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <SaveButton />
      <p className="text-xs text-ink-subtle">
        Unticking a document removes it from this report only. The project keeps its copy.
      </p>
    </form>
  );
}
