import "server-only";

import { createHash } from "node:crypto";

import { extractFromDocument } from "@/lib/ai/document-extraction";
import {
  extractionContentSchema,
  type ExtractionContent,
  type VerifiedExtraction,
} from "@/lib/documents/extraction-schema";
import { documentTypeLabel, DOCUMENT_BUCKET } from "@/lib/documents/metadata";
import { extractPdfText, pagesForPrompt } from "@/lib/documents/pdf-text";
import { createClient } from "@/lib/supabase/server";
import type { ExtractionStatus, TablesUpdate } from "@/types/database";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The lifecycle of one reading of one document.
 *
 * pending -> running -> succeeded, or -> failed. A reading that worked and was
 * later replaced becomes superseded rather than being deleted, because a
 * report drafted from it last week has to stay explainable.
 *
 * Two partial unique indexes in the database do the arguing, not this file:
 * one reading in flight per document, and one current reading per document. A
 * second tap while the first call is running loses the race in Postgres rather
 * than spending the model call twice, and that is deliberately not something
 * application code is trusted to remember.
 */

/** What a caller needs to know about the current state of a document. */
export type ExtractionSummaryRow = {
  id: string;
  documentId: string;
  status: ExtractionStatus;
  summary: string | null;
  error: string | null;
  model: string | null;
  promptVersion: string | null;
  pageCount: number | null;
  completedAt: string | null;
  content: ExtractionContent | null;
  /** Counts for a screen that has no room for the whole reading. */
  counts: { fields: number; scopeItems: number; requirements: number };
};

const EMPTY_COUNTS = { fields: 0, scopeItems: 0, requirements: 0 };

/**
 * Reads a stored extraction back into the shape the app trusts.
 *
 * Re-validated on the way out, not only on the way in. A row could have been
 * written by an older version of this code, and content that no longer parses
 * must not be handed to a prompt as though it did - the read returns null and
 * the caller shows the document as unread rather than half-read.
 */
export function contentOf(raw: unknown): ExtractionContent | null {
  const parsed = extractionContentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function rowToSummary(row: {
  id: string;
  document_id: string;
  status: ExtractionStatus;
  summary: string | null;
  error: string | null;
  model: string | null;
  prompt_version: string | null;
  source_page_count: number | null;
  completed_at: string | null;
  content: unknown;
}): ExtractionSummaryRow {
  const content = row.status === "succeeded" ? contentOf(row.content) : null;
  return {
    id: row.id,
    documentId: row.document_id,
    status: row.status,
    summary: row.summary,
    error: row.error,
    model: row.model,
    promptVersion: row.prompt_version,
    pageCount: row.source_page_count,
    completedAt: row.completed_at,
    content,
    counts: content
      ? {
          fields: content.fields.length,
          scopeItems: content.scope_items.length,
          requirements: content.requirements.length,
        }
      : EMPTY_COUNTS,
  };
}

const SUMMARY_COLUMNS =
  "id, document_id, status, summary, error, model, prompt_version, source_page_count, completed_at, content";

/**
 * The state of each document's reading, newest first per document.
 *
 * A superseded reading is never returned as the state of a document: the
 * current one is whichever row is succeeded, and failing that whatever is in
 * flight, and failing that the most recent failure.
 */
export async function currentExtractions(
  supabase: Client,
  documentIds: string[],
): Promise<Map<string, ExtractionSummaryRow>> {
  const state = new Map<string, ExtractionSummaryRow>();
  if (documentIds.length === 0) return state;

  const { data, error } = await supabase
    .from("document_extractions")
    .select(SUMMARY_COLUMNS)
    .in("document_id", documentIds)
    .neq("status", "superseded")
    .order("created_at", { ascending: false });

  // 42P01 is "relation does not exist": the migration is not on this database.
  // A project screen must not break because a feature nobody has used is
  // missing; the documents simply read as never extracted.
  if (error || !data) return state;

  for (const row of data) {
    const summary = rowToSummary(row);
    const held = state.get(summary.documentId);
    // Succeeded wins over anything; otherwise the newest row, which the order
    // above already supplies.
    if (!held || (summary.status === "succeeded" && held.status !== "succeeded")) {
      state.set(summary.documentId, summary);
    }
  }
  return state;
}

export type ExtractionOutcome = { ok: true; extraction: VerifiedExtraction } | { ok: false; error: string };

/**
 * Reads one document, from the stored object to a finished row.
 *
 * The row is created pending BEFORE the file is downloaded, so the one-in-
 * flight index is what stops a second attempt rather than a flag in memory
 * that a second server instance would not see.
 *
 * Every exit writes the row. There is no path that leaves a reading running
 * for ever, because a spinner nobody can clear is worse than a failure that
 * says why.
 */
export async function runExtraction(
  supabase: Client,
  document: {
    id: string;
    companyId: string;
    projectName: string;
    title: string;
    docType: string;
    storagePath: string;
  },
  requestedBy: string | null,
): Promise<ExtractionOutcome> {
  // A previous succeeded reading stays succeeded until this one works. If the
  // model is unreachable today, the job context the app already had is not
  // thrown away for the sake of the attempt.
  const { data: created, error: createError } = await supabase
    .from("document_extractions")
    .insert({
      company_id: document.companyId,
      document_id: document.id,
      status: "running",
      source_storage_path: document.storagePath,
      requested_by: requestedBy,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createError) {
    // 23505 is the one-in-flight index. Somebody already pressed the button.
    if (createError.code === "23505") {
      return { ok: false, error: "This document is already being read. Give it a moment." };
    }
    if (createError.code === "42P01") {
      return { ok: false, error: "Document reading is not installed on this database yet." };
    }
    return { ok: false, error: `Could not start reading the document: ${createError.message}` };
  }

  const finish = async (values: TablesUpdate<"document_extractions">) => {
    await supabase.from("document_extractions").update(values).eq("id", created.id);
  };

  const fail = async (message: string): Promise<ExtractionOutcome> => {
    await finish({ status: "failed", error: message, completed_at: new Date().toISOString() });
    return { ok: false, error: message };
  };

  const download = await supabase.storage.from(DOCUMENT_BUCKET).download(document.storagePath);
  if (download.error || !download.data) {
    return fail("The document could not be downloaded from storage.");
  }

  const bytes = new Uint8Array(await download.data.arrayBuffer());
  // The bytes that were actually read, fingerprinted. If the object is later
  // replaced, this says which file this reading came from - and two readings
  // of the same file can be told apart from two readings of two files.
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const text = await extractPdfText(bytes);
  if (!text.ok) {
    await finish({
      source_sha256: sha256,
      source_bytes: bytes.byteLength,
    });
    return fail(text.error);
  }

  const called = await extractFromDocument(
    {
      title: document.title,
      docTypeLabel: documentTypeLabel(document.docType),
      projectName: document.projectName,
      pages: pagesForPrompt(text.text.pages),
      truncated: text.text.truncated,
    },
    text.text.pages,
  );

  const sourceText = pagesForPrompt(text.text.pages);

  if (!called.ok) {
    await finish({
      source_sha256: sha256,
      source_bytes: bytes.byteLength,
      source_page_count: text.text.pageCount,
      source_text: sourceText,
    });
    return fail(called.error);
  }

  // Only now is the previous reading retired. The unique index allows one
  // succeeded row per document, so this must land before the insert below -
  // and it must not run at all on a failure, or a working reading would be
  // lost to an attempt that produced nothing.
  await supabase
    .from("document_extractions")
    .update({ status: "superseded" })
    .eq("document_id", document.id)
    .eq("status", "succeeded");

  await finish({
    status: "succeeded",
    source_sha256: sha256,
    source_bytes: bytes.byteLength,
    source_page_count: text.text.pageCount,
    source_text: sourceText,
    content: called.extraction.content,
    summary: called.extraction.content.summary,
    model: called.model,
    prompt_version: called.promptVersion,
    completed_at: new Date().toISOString(),
  });

  return { ok: true, extraction: called.extraction };
}
