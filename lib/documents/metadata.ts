/**
 * Supporting documents: what they are called, and how they read in a report.
 *
 * Pure, with no runtime imports and no path aliases, so it loads straight into
 * Node and the rules can be tested without a database or a renderer.
 */

import type { DocumentType } from "@/types/database";

export const DOCUMENT_BUCKET = "project-documents";

/** Signed URLs are re-minted per render; this only has to outlive one page view. */
export const DOCUMENT_URL_TTL_SECONDS = 60 * 60;

/**
 * Ordered by how often a site manager reaches for them, not alphabetically.
 * Drawings and RAMS are most of the traffic.
 */
export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "drawing", label: "Drawing" },
  { value: "specification", label: "Specification" },
  { value: "rams", label: "RAMS" },
  { value: "method_statement", label: "Method statement" },
  { value: "permit", label: "Permit" },
  { value: "inspection_sheet", label: "Inspection sheet" },
  { value: "certificate", label: "Certificate" },
  { value: "delivery_note", label: "Delivery note" },
  { value: "client_instruction", label: "Client instruction" },
  { value: "other", label: "Other" },
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((type) => [type.value, type.label]),
) as Record<DocumentType, string>;

export function documentTypeLabel(value: string | null): string {
  if (!value) return "Other";
  return DOCUMENT_TYPE_LABELS[value as DocumentType] ?? "Other";
}

/**
 * A sensible title from a filename, so nobody has to retype
 * "GA-Plan-Rev-C.pdf" on a phone. The extension goes, separators become
 * spaces, and the rest is left exactly as they named it - a drawing number is
 * not ours to prettify.
 */
export function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const spaced = withoutExtension.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced || filename;
}

/** "2.4 MB". Null when the size was never recorded, rather than "0 B". */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// What an issued report says a document was
// ---------------------------------------------------------------------------

/** The snapshot taken when a report was issued. Absent on a draft. */
export type DocumentSnapshot = {
  title_at_issue: string | null;
  type_at_issue: string | null;
  reference_at_issue: string | null;
  revision_at_issue: string | null;
  document_date_at_issue: string | null;
};

/** The document as it stands today. Absent if it has since been deleted. */
export type LiveDocument = {
  title: string;
  doc_type: string;
  reference: string | null;
  revision: string | null;
  document_date: string | null;
} | null;

export type ResolvedDocument = {
  title: string;
  typeLabel: string;
  reference: string | null;
  revision: string | null;
  documentDate: string | null;
};

/**
 * What to print for one referenced document.
 *
 * The snapshot wins wherever it exists. A drawing gets superseded - Rev C
 * becomes Rev D, the title is corrected, the reference is renumbered - and
 * none of that may change what an already issued report says it was issued
 * against. The stored PDF still names Rev C, and the record behind it has to
 * agree or the two contradict each other in front of a client.
 *
 * A draft has no snapshot and reads the live document, which is what makes
 * reopening work: change the selection, reissue, and the new snapshot is taken
 * then.
 */
export function resolveDocument(
  snapshot: DocumentSnapshot,
  live: LiveDocument,
): ResolvedDocument | null {
  const title = snapshot.title_at_issue ?? live?.title ?? null;
  // Nothing to show at all: no snapshot was taken and the document is gone.
  if (!title) return null;
  return {
    title,
    typeLabel: documentTypeLabel(snapshot.type_at_issue ?? live?.doc_type ?? null),
    reference: snapshot.reference_at_issue ?? live?.reference ?? null,
    revision: snapshot.revision_at_issue ?? live?.revision ?? null,
    documentDate: snapshot.document_date_at_issue ?? live?.document_date ?? null,
  };
}

// ---------------------------------------------------------------------------
// The table in the report
// ---------------------------------------------------------------------------

export type DocumentColumn = "document" | "type" | "reference" | "revision" | "date";

export const DOCUMENT_COLUMN_LABELS: Record<DocumentColumn, string> = {
  document: "Document",
  type: "Type",
  reference: "Reference",
  revision: "Revision",
  date: "Date",
};

/**
 * Which columns the Supporting Documents table should actually have.
 *
 * Document and Type always earn their place. The other three are optional on
 * every document, and a column of five blank cells tells the reader nothing
 * while making the table look like something went wrong - so a column appears
 * only when at least one row has something to put in it.
 */
export function visibleDocumentColumns(
  rows: readonly ResolvedDocument[],
): DocumentColumn[] {
  const columns: DocumentColumn[] = ["document", "type"];
  if (rows.some((row) => row.reference?.trim())) columns.push("reference");
  if (rows.some((row) => row.revision?.trim())) columns.push("revision");
  if (rows.some((row) => row.documentDate?.trim())) columns.push("date");
  return columns;
}

export function documentCell(row: ResolvedDocument, column: DocumentColumn): string {
  switch (column) {
    case "document":
      return row.title;
    case "type":
      return row.typeLabel;
    case "reference":
      return row.reference?.trim() || "-";
    case "revision":
      return row.revision?.trim() || "-";
    case "date":
      return row.documentDate?.trim() || "-";
  }
}
