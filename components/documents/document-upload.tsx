"use client";

import { useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";

import { attachDocument } from "@/app/(app)/documents/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PDF_CONTENT_TYPE,
  PDF_SIGNATURE_BYTES,
  checkDocumentFile,
  describeUploadOutcome,
} from "@/lib/documents/file-validation";
import { DOCUMENT_BUCKET, DOCUMENT_TYPES, titleFromFilename } from "@/lib/documents/metadata";
import { createClient } from "@/lib/supabase/client";
import type { DocumentType } from "@/types/database";

/**
 * Uploads a PDF straight from the browser to Supabase Storage, then records it.
 *
 * The same split as photographs, for the same reason: a Server Action's
 * request body is capped well below the bucket limit and a drawing set is
 * larger than a photograph. Storage RLS already restricts writes to the
 * caller's own company folder, so the direct upload is no less protected than
 * a proxied one.
 *
 * This one component serves the project Documents tab and both kinds of
 * report, so the picker and the checks cannot drift apart between them.
 *
 * On iOS the input opens Files, which covers iCloud Drive, On My iPhone and
 * every provider the user has connected - which is where a drawing emailed
 * that morning actually lives. Confirmed working on a real iPad.
 *
 * It carries no `accept` attribute; lib/documents/file-validation.ts explains
 * why, and is what enforces PDF-only once a file has been chosen.
 */
export function DocumentUpload({
  companyId,
  projectId,
  reportId = null,
  summaryReportId = null,
  label = "Upload a PDF",
  onAttached,
  attachedLabel = "Working…",
  simple = false,
}: {
  companyId: string;
  projectId: string;
  reportId?: string | null;
  summaryReportId?: string | null;
  label?: string;
  /**
   * What happens to a document once it is stored and recorded.
   *
   * Site Capture passes a server action that makes it job context and reads
   * it, so adding a purchase order there is one tap. The Documents tab passes
   * nothing, and an upload there implies nothing. Awaited per file, so the
   * button keeps saying what is happening until it has happened.
   */
  onAttached?: (documentId: string) => Promise<{ error?: string } | void>;
  /** What the button says while onAttached runs. */
  attachedLabel?: string;
  /**
   * One button and one line, for Site Capture. No "Upload as" menu: the type
   * is left as Other for the office to set, and SiteBoss reads the document
   * itself to find out what it is.
   */
  simple?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [docType, setDocType] = useState<DocumentType>(simple ? "other" : "drawing");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [afterUpload, setAfterUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The first bytes, or null if they cannot be read.
   *
   * A provider that has not finished materialising a file from iCloud can fail
   * this read, and that is not the user's fault - checkDocumentFile falls back
   * to the name and declared type rather than refusing outright.
   */
  async function readSignature(file: File): Promise<Uint8Array | null> {
    try {
      const head = await file.slice(0, PDF_SIGNATURE_BYTES).arrayBuffer();
      return new Uint8Array(head);
    } catch {
      return null;
    }
  }

  async function handleFiles(files: FileList) {
    const chosen = Array.from(files);
    if (chosen.length === 0) return;

    setError(null);
    setBusy({ done: 0, total: chosen.length });

    const supabase = createClient();
    const failures: string[] = [];
    let uploaded = 0;

    for (const [index, file] of chosen.entries()) {
      const check = checkDocumentFile(file, await readSignature(file));
      if (!check.ok) {
        failures.push(check.reason);
        setBusy({ done: index + 1, total: chosen.length });
        continue;
      }

      try {
        const path = `${companyId}/${projectId}/${crypto.randomUUID()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .upload(path, file, {
            // Normalised: the bucket is PDF-only and iOS routinely hands over a
            // genuine PDF as an empty string or octet-stream. Safe to assert
            // here only because the signature check above has passed.
            contentType: PDF_CONTENT_TYPE,
            upsert: false,
          });

        if (uploadError) {
          failures.push(`${file.name} could not be uploaded. ${uploadError.message}`);
        } else {
          const result = await attachDocument({
            projectId,
            reportId,
            summaryReportId,
            storagePath: path,
            title: titleFromFilename(file.name),
            originalFilename: file.name,
            docType,
            fileSize: file.size,
            mimeType: PDF_CONTENT_TYPE,
          });
          if (result?.error) failures.push(result.error);
          else {
            uploaded += 1;
            if (onAttached && result.documentId) {
              setAfterUpload(true);
              try {
                const followed = await onAttached(result.documentId);
                if (followed?.error) failures.push(followed.error);
              } finally {
                setAfterUpload(false);
              }
            }
          }
        }
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : `${file.name} could not be uploaded.`);
      }

      setBusy({ done: index + 1, total: chosen.length });
    }

    setBusy(null);
    if (input.current) input.current.value = "";
    setError(describeUploadOutcome({ uploaded, failures }));
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-end gap-3">
        {simple ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor={`doc-type-${projectId}`} className="text-sm font-medium text-ink">
            Upload as
          </label>
          <select
            id={`doc-type-${projectId}`}
            value={docType}
            onChange={(event) => setDocType(event.target.value as DocumentType)}
            className="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-ink"
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        )}

        <Button
          type="button"
          size="lg"
          variant="secondary"
          className={simple ? "w-full text-base" : undefined}
          loading={busy !== null}
          onClick={() => input.current?.click()}
        >
          <FilePlus2 aria-hidden />
          {afterUpload ? attachedLabel : busy ? `Uploading ${busy.done}/${busy.total}…` : label}
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        // No accept attribute: it earns nothing here, and checkDocumentFile
        // enforces PDF-only after selection. See file-validation.ts.
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
        }}
      />
      {simple ? (
        <p className="text-xs text-ink-subtle">Optional. An order, drawing, survey or instruction.</p>
      ) : (
        <p className="text-xs text-ink-subtle">
          PDFs up to 25 MB, from Files, iCloud Drive or anywhere else on the device. You can rename
          it and add a reference, revision or date afterwards.
        </p>
      )}
    </div>
  );
}
