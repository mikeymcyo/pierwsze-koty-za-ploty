/**
 * Supporting documents: their metadata, and what an issued report says they
 * were.
 *
 * Needs neither Supabase nor a dev server. The database-level guarantees -
 * tenant isolation, removing a reference not deleting the document, a project
 * delete taking its documents with it - are in supabase/tests/03_documents_test.sql,
 * which runs against a real PostgreSQL.
 */
import {
  DOCUMENT_COLUMN_LABELS,
  DOCUMENT_TYPES,
  documentCell,
  documentTypeLabel,
  formatFileSize,
  resolveDocument,
  titleFromFilename,
  visibleDocumentColumns,
} from "../lib/documents/metadata.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. The document types a site manager actually files");
check("all ten kinds are offered", DOCUMENT_TYPES.length === 10);
check(
  "including the ones the owner asked for by name",
  ["drawing", "specification", "rams", "method_statement", "permit", "inspection_sheet", "certificate", "delivery_note", "client_instruction", "other"].every(
    (value) => DOCUMENT_TYPES.some((type) => type.value === value),
  ),
);
check("a known type reads properly", documentTypeLabel("rams") === "RAMS");
check("and an unknown one does not crash the report", documentTypeLabel("not_a_type") === "Other");
check("nor does a missing one", documentTypeLabel(null) === "Other");

console.log("\n2. Uploading is fast because nothing has to be retyped");
check(
  "the title comes from the filename",
  titleFromFilename("GA-Plan-Rev-C.pdf") === "GA-Plan-Rev-C",
);
check(
  "underscores become spaces",
  titleFromFilename("Method_Statement_v2.pdf") === "Method Statement v2",
);
check("a drawing number is left exactly as they named it", titleFromFilename("A-100.pdf") === "A-100");
check("a file with no extension still gets a title", titleFromFilename("Permit") === "Permit");

console.log("\n3. File size reads like a file size");
check("bytes", formatFileSize(512) === "512 B");
check("kilobytes", formatFileSize(2048) === "2 KB");
check("megabytes", formatFileSize(3 * 1024 * 1024) === "3.0 MB");
check("an unrecorded size is absent, not zero", formatFileSize(null) === null);
check("and so is a nonsense one", formatFileSize(-1) === null);

console.log("\n4. An issued report keeps saying what it was issued against");
const superseded = {
  title: "GA Plan (superseded)",
  doc_type: "drawing",
  reference: "A-100-B",
  revision: "D",
  document_date: "2026-03-01",
};
const snapshot = {
  title_at_issue: "GA Plan",
  type_at_issue: "drawing",
  reference_at_issue: "A-100",
  revision_at_issue: "C",
  document_date_at_issue: "2026-01-05",
};
const issued = resolveDocument(snapshot, superseded);
check("the snapshot wins over the live document", issued.revision === "C", issued.revision);
check("including its title", issued.title === "GA Plan", issued.title);
check("and its reference", issued.reference === "A-100", issued.reference);
check(
  "a draft with no snapshot reads today's document",
  resolveDocument(
    {
      title_at_issue: null,
      type_at_issue: null,
      reference_at_issue: null,
      revision_at_issue: null,
      document_date_at_issue: null,
    },
    superseded,
  ).revision === "D",
);
check(
  "an issued reference survives the document being deleted",
  resolveDocument(snapshot, null)?.title === "GA Plan",
);
check(
  "but a draft reference to a deleted document prints nothing at all",
  resolveDocument(
    {
      title_at_issue: null,
      type_at_issue: null,
      reference_at_issue: null,
      revision_at_issue: null,
      document_date_at_issue: null,
    },
    null,
  ) === null,
);

console.log("\n5. The table has no empty columns");
const rows = [
  { title: "GA Plan", typeLabel: "Drawing", reference: "A-100", revision: "C", documentDate: null },
  { title: "RAMS", typeLabel: "RAMS", reference: null, revision: null, documentDate: null },
];
check(
  "a column with something in it appears",
  visibleDocumentColumns(rows).join() === "document,type,reference,revision",
  visibleDocumentColumns(rows).join(),
);
check(
  "a column nobody filled is dropped",
  !visibleDocumentColumns(rows).includes("date"),
);
check(
  "with no optional metadata at all, only the two that always matter",
  visibleDocumentColumns([rows[1]]).join() === "document,type",
);
check(
  "a date on any one row brings the column back",
  visibleDocumentColumns([
    rows[1],
    { title: "Permit", typeLabel: "Permit", reference: null, revision: null, documentDate: "2026-02-01" },
  ]).includes("date"),
);
check("every column has a heading", visibleDocumentColumns(rows).every((c) => DOCUMENT_COLUMN_LABELS[c]));
check("a cell prints its value", documentCell(rows[0], "reference") === "A-100");
check("and a blank cell is a dash, not the word null", documentCell(rows[1], "reference") === "-");

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL DOCUMENT CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
