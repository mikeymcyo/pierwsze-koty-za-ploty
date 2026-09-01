import "server-only";

import type { DocumentContext } from "@/lib/ai/job-context";
import { contentOf } from "@/lib/documents/extractions";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The documents this job's AI is allowed to read, as a prompt sees them.
 *
 * Three gates, and a document passes all three or contributes nothing:
 *
 *  1. Somebody marked it "use as AI context" and has not taken it back out
 *     (job_context_documents, removed_at is null).
 *  2. It was read, and the reading succeeded (document_extractions,
 *     status = 'succeeded' - a failed or in-flight reading is not context).
 *  3. What was stored still parses as an extraction. Content written by an
 *     older version that no longer reads is skipped rather than half-used.
 *
 * Every item that survives was quoted from the document and the quote was
 * checked against the document's own text before it was stored, so nothing a
 * model invented can reach a prompt through here.
 */
export async function documentContextForProject(
  supabase: Client,
  projectId: string,
): Promise<DocumentContext[]> {
  // Documents belong to a project; the context mark carries no project of its
  // own, deliberately. So the project's documents come first and the marks are
  // matched against them.
  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, title, doc_type")
    .eq("project_id", projectId);

  // 42P01: the documents feature is not installed on this database. A report
  // is drafted from the notes, as it was before any of this existed.
  if (documentsError || !documents?.length) return [];

  const ids = documents.map((document) => document.id);

  const [{ data: marks }, { data: extractions }] = await Promise.all([
    supabase
      .from("job_context_documents")
      .select("document_id, sort_order, created_at")
      .in("document_id", ids)
      .is("removed_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("document_extractions")
      .select("document_id, content, summary")
      .in("document_id", ids)
      .eq("status", "succeeded"),
  ]);

  if (!marks?.length || !extractions?.length) return [];

  const titles = new Map(documents.map((document) => [document.id, document.title]));
  const readings = new Map(extractions.map((row) => [row.document_id, row]));

  const context: DocumentContext[] = [];
  for (const mark of marks) {
    const reading = readings.get(mark.document_id);
    if (!reading) continue;
    const content = contentOf(reading.content);
    if (!content) continue;

    context.push({
      title: titles.get(mark.document_id) ?? "Job document",
      kind: content.document_kind,
      summary: content.summary ?? reading.summary,
      fields: content.fields.map((field) => ({
        label: field.label,
        value: field.value,
        page: field.page,
      })),
      scopeItems: content.scope_items.map((item) => ({
        text: item.text,
        commitment: item.commitment,
        page: item.page,
      })),
      requirements: content.requirements.map((requirement) => ({
        text: requirement.text,
        page: requirement.page,
      })),
    });
  }

  return context;
}
