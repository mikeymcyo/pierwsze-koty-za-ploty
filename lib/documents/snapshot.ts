import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DocumentType } from "@/types/database";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Freezes what each referenced document was, at the moment a report is issued.
 *
 * A drawing gets superseded: Rev C becomes Rev D, the title is corrected, the
 * reference is renumbered. None of that may change what an already issued
 * report says it was issued against - the stored PDF still names Rev C, and
 * the record behind it has to agree, or the two contradict each other in front
 * of a client.
 *
 * Written immediately before the PDF is rendered, so the table printed in the
 * document and the snapshot in the database are taken from the same read. The
 * same idea, and the same moment, as summary_report_issues capturing an
 * issue's status.
 *
 * Re-issuing a reopened report overwrites the snapshot on purpose: the new PDF
 * is issued against whatever is selected now, and the record must say so.
 */
export type DocumentParent =
  | { table: "report_documents"; column: "report_id"; id: string }
  | { table: "summary_report_documents"; column: "summary_report_id"; id: string };

/** The link rows for either parent, read through a concretely typed query. */
async function readLinks(supabase: Client, parent: DocumentParent) {
  const columns =
    "id, document_id, sort_order, title_at_issue, type_at_issue, reference_at_issue, revision_at_issue, document_date_at_issue";
  return parent.table === "report_documents"
    ? supabase
        .from("report_documents")
        .select(columns)
        .eq("report_id", parent.id)
        .order("sort_order", { ascending: true })
    : supabase
        .from("summary_report_documents")
        .select(columns)
        .eq("summary_report_id", parent.id)
        .order("sort_order", { ascending: true });
}

type SnapshotValues = {
  title_at_issue: string | null;
  type_at_issue: DocumentType;
  reference_at_issue: string | null;
  revision_at_issue: string | null;
  document_date_at_issue: string | null;
};

async function writeSnapshot(
  supabase: Client,
  parent: DocumentParent,
  linkId: string,
  values: SnapshotValues,
) {
  return parent.table === "report_documents"
    ? supabase.from("report_documents").update(values).eq("id", linkId)
    : supabase.from("summary_report_documents").update(values).eq("id", linkId);
}

export async function snapshotDocumentReferences(
  supabase: Client,
  parent: DocumentParent,
): Promise<{ error?: string }> {
  const { data: links, error } = await readLinks(supabase, parent);
  // 42P01 is "relation does not exist": the documents migration has not been
  // applied to this database yet. Finalising a report must not fail because a
  // feature nobody has used is not installed.
  if (error) {
    if (error.code === "42P01") return {};
    return { error: `Could not read the referenced documents: ${error.message}` };
  }
  if (!links?.length) return {};

  const { data: documents, error: documentError } = await supabase
    .from("documents")
    .select("id, title, doc_type, reference, revision, document_date")
    .in(
      "id",
      links.map((link) => link.document_id),
    );
  if (documentError) {
    return { error: `Could not read the referenced documents: ${documentError.message}` };
  }

  const byId = new Map((documents ?? []).map((document) => [document.id, document]));
  for (const link of links) {
    const document = byId.get(link.document_id);
    if (!document) continue;
    const { error: writeError } = await writeSnapshot(supabase, parent, link.id, {
      title_at_issue: document.title,
      type_at_issue: document.doc_type,
      reference_at_issue: document.reference,
      revision_at_issue: document.revision,
      document_date_at_issue: document.document_date,
    });
    if (writeError) {
      return { error: `Could not record the document reference: ${writeError.message}` };
    }
  }

  return {};
}

/**
 * The documents a report references, resolved for printing.
 *
 * Reads the snapshot where one exists and the live document otherwise, which
 * is what makes a draft preview show today's metadata while an issued report
 * keeps saying what it said.
 */
export async function loadReferencedDocuments(
  supabase: Client,
  parent: DocumentParent,
): Promise<
  {
    snapshot: {
      title_at_issue: string | null;
      type_at_issue: string | null;
      reference_at_issue: string | null;
      revision_at_issue: string | null;
      document_date_at_issue: string | null;
    };
    live: {
      title: string;
      doc_type: string;
      reference: string | null;
      revision: string | null;
      document_date: string | null;
    } | null;
  }[]
> {
  const { data: links } = await readLinks(supabase, parent);
  if (!links?.length) return [];

  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, doc_type, reference, revision, document_date")
    .in(
      "id",
      links.map((link) => link.document_id),
    );
  const byId = new Map((documents ?? []).map((document) => [document.id, document]));

  return links.map((link) => ({
    snapshot: {
      title_at_issue: link.title_at_issue,
      type_at_issue: link.type_at_issue,
      reference_at_issue: link.reference_at_issue,
      revision_at_issue: link.revision_at_issue,
      document_date_at_issue: link.document_date_at_issue,
    },
    live: byId.get(link.document_id) ?? null,
  }));
}
