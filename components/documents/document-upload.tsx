"use client";

import { useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";

import { attachDocument } from "@/app/(app)/documents/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DOCUMENT_BUCKET, DOCUMENT_TYPES, titleFromFilename } from "@/lib/documents/metadata";
import { createClient } from "@/lib/supabase/client";
import type { DocumentType } from "@/types/database";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Uploads a PDF straight from the browser to Supabase Storage, then records it.
 *
 * The same split as photographs, for the same reason: a Server Action's
 * request body is capped well below the bucket limit and a drawing set is
 * larger than a photograph. Storage RLS already restricts writes to the
 * caller's own company folder, so the direct upload is no less protected than
 * a proxied one.
 *
 * On iOS the file input opens Files, which covers iCloud Drive, On My iPhone
 * and anything else the user has connected - which is where a drawing emailed
 * that morning actually lives. `accept` filters the picker; the check below is
 * what enforces it, because a picker's accept is a hint and not a promise.
 */
export function DocumentUpload({
  companyId,
  projectId,
  reportId = null,
  summaryReportId = null,
  label = "Upload a PDF",
}: {
  companyId: string;
  projectId: string;
  reportId?: string | null;
  summaryReportId?: string | null;
  label?: string;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [docType, setDocType] = useState<DocumentType>("drawing");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList) {
    const chosen = Array.from(files);
    if (chosen.length === 0) return;

    const list = chosen.filter(
      (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name),
    );
    const skipped = chosen.length - list.length;
    const oversized = list.filter((file) => file.size > MAX_BYTES);

    if (list.length === 0) {
      setError(
        `Nothing uploaded. ${skipped} ${skipped === 1 ? "file was" : "files were"} not a PDF.`,
      );
      if (input.current) input.current.value = "";
      return;
    }

    setError(null);
    setBusy({ done: 0, total: list.length - oversized.length });

    const supabase = createClient();
    const failures: string[] = [];
    let done = 0;

    for (const file of list) {
      if (file.size > MAX_BYTES) {
        failures.push(`${file.name} is larger than 25 MB.`);
        continue;
      }
      try {
        const path = `${companyId}/${projectId}/${crypto.randomUUID()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .upload(path, file, { contentType: "application/pdf", upsert: false });

        if (uploadError) {
          failures.push(uploadError.message);
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
            mimeType: "application/pdf",
          });
          if (result?.error) failures.push(result.error);
        }
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : "Upload failed");
      }
      done += 1;
      setBusy({ done, total: list.length - oversized.length });
    }

    setBusy(null);
    if (input.current) input.current.value = "";

    if (failures.length) setError(failures[0]);
    else if (skipped > 0) {
      setError(
        `${list.length} uploaded. ${skipped} ${skipped === 1 ? "file was" : "files were"} not a PDF and ${skipped === 1 ? "was" : "were"} skipped.`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-end gap-3">
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

        <Button
          type="button"
          size="lg"
          variant="secondary"
          loading={busy !== null}
          onClick={() => input.current?.click()}
        >
          <FilePlus2 aria-hidden />
          {busy ? `Uploading ${busy.done}/${busy.total}…` : label}
        </Button>
      </div>

      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
        }}
      />
      <p className="text-xs text-ink-subtle">
        PDFs up to 25 MB. You can rename it and add a reference, revision or date afterwards.
      </p>
    </div>
  );
}
