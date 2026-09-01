import "server-only";

import type { JobContextDocument } from "@/components/projects/job-context";
import { currentExtractions } from "@/lib/documents/extractions";
import { briefDocumentIds } from "@/lib/projects/job-brief";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Every document on a job, as the Job Context strip shows it.
 *
 * One loader for the two screens that show the strip - Site Capture and the
 * project overview - so "is this document job context, and has it been read"
 * cannot be answered two different ways on two different pages.
 *
 * Scope comes from job_context_documents, which is the standing fact, with
 * the brief's own `(doc:...)` markers folded in behind it: a project marked
 * before that table existed still reads as scope rather than silently losing
 * it. The brief entries themselves are untouched history either way.
 */
export async function loadJobContextDocuments(
  supabase: Client,
  projectId: string,
  description: string | null,
): Promise<JobContextDocument[]> {
  const { data: rows } = await supabase
    .from("documents")
    .select("id, title, original_filename, doc_type")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const documents = rows ?? [];
  if (documents.length === 0) return [];

  const ids = documents.map((row) => row.id);

  const [{ data: contextRows }, readings] = await Promise.all([
    supabase
      .from("job_context_documents")
      .select("document_id")
      .in("document_id", ids)
      .is("removed_at", null),
    currentExtractions(supabase, ids),
  ]);

  const scopeIds = new Set([
    ...briefDocumentIds(description),
    ...(contextRows ?? []).map((row) => row.document_id),
  ]);

  return documents.map((row) => {
    const reading = readings.get(row.id);
    const content = reading?.content ?? null;
    return {
      id: row.id,
      title: row.title,
      filename: row.original_filename,
      docType: row.doc_type,
      inScope: scopeIds.has(row.id),
      reading: reading
        ? {
            status: reading.status,
            summary: reading.summary,
            error: reading.error,
            counts: reading.counts,
            instructed: (content?.scope_items ?? [])
              .filter((item) => item.commitment === "instructed")
              .map((item) => item.text),
            proposed: (content?.scope_items ?? [])
              .filter((item) => item.commitment === "proposed")
              .map((item) => item.text),
          }
        : null,
    };
  });
}
