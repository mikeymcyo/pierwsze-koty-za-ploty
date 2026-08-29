"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { DOCUMENT_BUCKET } from "@/lib/documents/metadata";
import { dependentsOfDocument } from "@/lib/documents/dependents";
import { canDelete } from "@/lib/reports/lifecycle";
import { createClient } from "@/lib/supabase/server";

export type DocumentFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
};

const DOCUMENT_TYPES = [
  "drawing",
  "specification",
  "rams",
  "method_statement",
  "permit",
  "inspection_sheet",
  "certificate",
  "delivery_note",
  "client_instruction",
  "other",
] as const;

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null));

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a valid date");

const metadataSchema = z.object({
  title: z.string().trim().min(1, "Give the document a title").max(200),
  docType: z.enum(DOCUMENT_TYPES),
  description: optionalText,
  reference: optionalText,
  revision: optionalText,
  documentDate: optionalDate,
  expiryDate: optionalDate,
});

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

const attachSchema = z.object({
  projectId: z.uuid(),
  /** Null uploads to the project only; a report id also references it there. */
  reportId: z.uuid().nullable(),
  summaryReportId: z.uuid().nullable(),
  storagePath: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  originalFilename: z.string().trim().min(1),
  docType: z.enum(DOCUMENT_TYPES),
  fileSize: z.number().int().nonnegative().nullable(),
  mimeType: z.string().trim().min(1).nullable(),
});

export type AttachDocumentInput = z.input<typeof attachSchema>;

/**
 * Records an uploaded document, and references it from a report when one is
 * named.
 *
 * The file itself goes straight from the browser to Supabase Storage, exactly
 * as photographs do and for the same reason: a Server Action's request body is
 * capped well below the bucket limit, and a drawing set is bigger than a
 * photograph. The row is written only once the object exists, and the path is
 * re-derived from the session here rather than trusted from the client.
 */
export async function attachDocument(
  input: AttachDocumentInput,
): Promise<{ error?: string; documentId?: string }> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { error: "That upload could not be recorded." };

  const session = await requireSessionContext();
  const supabase = await createClient();
  const value = parsed.data;

  const expectedPrefix = `${session.companyId}/${value.projectId}/`;
  if (!value.storagePath.startsWith(expectedPrefix)) {
    return { error: "That upload could not be recorded." };
  }

  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      company_id: session.companyId,
      project_id: value.projectId,
      storage_path: value.storagePath,
      title: value.title,
      original_filename: value.originalFilename,
      doc_type: value.docType,
      file_size: value.fileSize,
      mime_type: value.mimeType,
      uploaded_by: session.userId,
    })
    .select("id")
    .single();
  if (error) return { error: `Could not save the document: ${error.message}` };

  if (value.reportId) {
    await supabase.from("report_documents").insert({
      company_id: session.companyId,
      report_id: value.reportId,
      document_id: document.id,
    });
    revalidatePath(`/reports/${value.reportId}`);
  }
  if (value.summaryReportId) {
    await supabase.from("summary_report_documents").insert({
      company_id: session.companyId,
      summary_report_id: value.summaryReportId,
      document_id: document.id,
    });
    revalidatePath(`/summary-reports/${value.summaryReportId}`);
  }

  revalidatePath(`/projects/${value.projectId}`);
  return { documentId: document.id };
}

export async function saveDocumentMetadata(
  documentId: string,
  _previous: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  if (!z.uuid().safeParse(documentId).success) return { error: "That document could not be found." };

  const parsed = metadataSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    docType: String(formData.get("docType") ?? ""),
    description: String(formData.get("description") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    revision: String(formData.get("revision") ?? ""),
    documentDate: String(formData.get("documentDate") ?? ""),
    expiryDate: String(formData.get("expiryDate") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  await requireSessionContext();
  const supabase = await createClient();

  const { data: document, error } = await supabase
    .from("documents")
    .update({
      title: parsed.data.title,
      doc_type: parsed.data.docType,
      description: parsed.data.description,
      reference: parsed.data.reference,
      revision: parsed.data.revision,
      document_date: parsed.data.documentDate,
      expiry_date: parsed.data.expiryDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: `Could not save the document: ${error.message}` };
  if (!document) return { error: "That document could not be found." };

  // Reports that have already been issued keep their snapshot and are
  // deliberately untouched by this.
  revalidatePath(`/projects/${document.project_id}`);
  return { saved: true };
}

/**
 * Removes a document from the project entirely.
 *
 * Refused while any issued report references it. The snapshot on that
 * reference would survive, but the reader of an issued report must still be
 * able to open the drawing it names - and a document quietly disappearing from
 * under an issued record is exactly the silent evidence loss this product
 * cannot afford. Drafts do not block: nothing has been sent.
 */
export async function deleteDocument(
  documentId: string,
  _previous: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  if (!z.uuid().safeParse(documentId).success) return { error: "That document could not be found." };

  await requireSessionContext();
  const supabase = await createClient();

  const { data: document } = await supabase
    .from("documents")
    .select("id, project_id, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) return { error: "That document could not be found." };

  const dependents = await dependentsOfDocument(supabase, documentId);
  const check = canDelete({
    status: "final",
    dependents,
    typedConfirmation: String(formData.get("confirmation") ?? ""),
  });
  if (!check.ok) return { error: check.message };

  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) return { error: `Could not delete the document: ${error.message}` };

  await supabase.storage.from(DOCUMENT_BUCKET).remove([document.storage_path]);

  revalidatePath(`/projects/${document.project_id}`);
  return { saved: true };
}

/**
 * Replaces which project documents a report references.
 *
 * Only the references change. Unticking a document removes this report's link
 * to it and leaves the project's copy, its metadata and every other report's
 * reference exactly where they were.
 */
export async function saveReportDocuments(
  reportId: string,
  _previous: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  return saveLinks({
    table: "report_documents",
    parentTable: "reports",
    parentId: reportId,
    formData,
    path: `/reports/${reportId}`,
  });
}

export async function saveSummaryReportDocuments(
  reportId: string,
  _previous: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  return saveLinks({
    table: "summary_report_documents",
    parentTable: "summary_reports",
    parentId: reportId,
    formData,
    path: `/summary-reports/${reportId}`,
  });
}

async function saveLinks({
  table,
  parentTable,
  parentId,
  formData,
  path,
}: {
  table: "report_documents" | "summary_report_documents";
  parentTable: "reports" | "summary_reports";
  parentId: string;
  formData: FormData;
  path: string;
}): Promise<DocumentFormState> {
  if (!z.uuid().safeParse(parentId).success) return { error: "That report could not be found." };

  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: parent } =
    parentTable === "reports"
      ? await supabase.from("reports").select("id, project_id, status").eq("id", parentId).maybeSingle()
      : await supabase
          .from("summary_reports")
          .select("id, project_id, status")
          .eq("id", parentId)
          .maybeSingle();
  if (!parent) return { error: "That report could not be found." };
  if (parent.status === "final") {
    return { error: "This report has been issued. Reopen it to change the documents it references." };
  }

  const requested = formData.getAll("documentId").map(String);

  // Only documents belonging to this report's own project may be referenced -
  // checked here rather than trusted from the form.
  const { data: allowed } = requested.length
    ? await supabase
        .from("documents")
        .select("id")
        .eq("project_id", parent.project_id)
        .in("id", requested)
    : { data: [] as { id: string }[] };

  const { error: clearError } =
    table === "report_documents"
      ? await supabase.from("report_documents").delete().eq("report_id", parentId)
      : await supabase.from("summary_report_documents").delete().eq("summary_report_id", parentId);
  if (clearError) return { error: `Could not update the selection: ${clearError.message}` };

  if (allowed?.length) {
    // Written in the order the person ticked them, not the order they arrived.
    const order = new Map(requested.map((id, index) => [id, index]));
    const ordered = [...allowed].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    const { error } =
      table === "report_documents"
        ? await supabase.from("report_documents").insert(
            ordered.map((document, index) => ({
              company_id: session.companyId,
              report_id: parentId,
              document_id: document.id,
              sort_order: index,
            })),
          )
        : await supabase.from("summary_report_documents").insert(
            ordered.map((document, index) => ({
              company_id: session.companyId,
              summary_report_id: parentId,
              document_id: document.id,
              sort_order: index,
            })),
          );
    if (error) return { error: `Could not save the selection: ${error.message}` };
  }

  revalidatePath(path);
  revalidatePath(`/projects/${parent.project_id}`);
  return { saved: true };
}
