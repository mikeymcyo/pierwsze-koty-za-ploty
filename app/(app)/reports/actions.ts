"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { displayName, requireSessionContext } from "@/lib/auth/session";
import { PDF_BUCKET } from "@/lib/pdf/signing";
import { copyPreviousEntries } from "@/lib/reports/carry-over";
import { dependentsOfDailyReport } from "@/lib/reports/dependents";
import { REPORT_IS_FINAL } from "@/lib/reports/immutability";
import { canDelete } from "@/lib/reports/lifecycle";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";

export type DeleteState = { error?: string };

export type ReportFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

/** Turns an empty form field into null rather than an empty string. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

const reportSchema = z.object({
  report_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"),
  weather: optionalText,
  raw_notes: optionalText,
});

/**
 * Repeatable rows arrive as parallel same-named fields, so they are read with
 * getAll() and zipped by index. A row whose only meaningful field is blank is
 * dropped rather than rejected: the capture screen always renders one empty row
 * so there is something to type into, and an untouched one must not be an error.
 */
function workforceRows(formData: FormData) {
  const names = formData.getAll("workforce_company_name").map(String);
  const trades = formData.getAll("workforce_trade").map(String);
  const operatives = formData.getAll("workforce_operatives").map(String);

  return names
    .map((company_name, index) => ({
      company_name: company_name.trim(),
      trade: trades[index]?.trim() || null,
      operatives: Number.parseInt(operatives[index] ?? "", 10),
      sort_order: index,
    }))
    .filter((row) => row.company_name.length > 0)
    .map((row, index) => ({
      ...row,
      operatives: Number.isFinite(row.operatives) && row.operatives >= 0 ? row.operatives : 0,
      sort_order: index,
    }));
}

function plantRows(formData: FormData) {
  const descriptions = formData.getAll("plant_description").map(String);
  const quantities = formData.getAll("plant_quantity").map(String);

  return descriptions
    .map((description, index) => ({
      description: description.trim(),
      quantity: Number.parseInt(quantities[index] ?? "", 10),
      sort_order: index,
    }))
    .filter((row) => row.description.length > 0)
    .map((row, index) => ({
      ...row,
      quantity: Number.isFinite(row.quantity) && row.quantity >= 0 ? row.quantity : 0,
      sort_order: index,
    }));
}

/**
 * Creates a draft report for a project and opens it.
 *
 * The report number is deliberately not supplied: the reports_assign_number
 * trigger allocates the next gapless number for the project under an advisory
 * lock. Reading it back is the only way to know what it became.
 *
 * Workforce and plant are copied from the project's previous report, because on
 * most sites the same subcontractors and machines are there day after day and
 * retyping them on a phone is the single most tedious part of the job. They are
 * a starting point, not a commitment - every copied row can be edited or removed.
 */
export async function startReport(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) redirect("/reports/new");

  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      company_id: session.companyId,
      project_id: projectId,
      author_id: session.userId,
      author_name: displayName(session),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not start the report: ${error.message}`);
  }

  await copyPreviousEntries(supabase, projectId, report.id, session.companyId);

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/reports/${report.id}`);
}

/**
 * Saves the capture screen.
 *
 * Workforce and plant are replaced wholesale rather than diffed: rows have no
 * stable client-side identity once one is removed from the middle, and a report
 * carries a handful of rows, not thousands. Validation runs before anything is
 * deleted so a rejected submission cannot lose the existing rows.
 */
export async function saveReport(
  reportId: string,
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const parsed = reportSchema.safeParse({
    report_date: formData.get("report_date") ?? "",
    weather: formData.get("weather") ?? "",
    raw_notes: formData.get("raw_notes") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const workforce = workforceRows(formData);
  const plant = plantRows(formData);

  const session = await requireSessionContext();
  const supabase = await createClient();

  // RLS already limits every statement below to the caller's company, and
  // status = draft is what keeps an issued report immutable. Filtering on it
  // here rather than reading first makes the check part of the write, so two
  // people cannot both pass it and then both save.
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .update(parsed.data)
    .eq("id", reportId)
    .eq("status", "draft")
    .select("project_id")
    .maybeSingle();

  if (reportError) return { error: `Could not save the report: ${reportError.message}` };

  // No row came back: either it is not ours, which RLS decided, or it has been
  // finalised. Nothing below may run in either case - the workforce and plant
  // rows are replaced by deleting them first, and that would empty an issued
  // report.
  if (!report) return { error: REPORT_IS_FINAL };

  const [{ error: workforceDeleteError }, { error: plantDeleteError }] = await Promise.all([
    supabase.from("workforce_entries").delete().eq("report_id", reportId),
    supabase.from("plant_entries").delete().eq("report_id", reportId),
  ]);

  const deleteError = workforceDeleteError ?? plantDeleteError;
  if (deleteError) return { error: `Could not save the report: ${deleteError.message}` };

  if (workforce.length) {
    const { error } = await supabase
      .from("workforce_entries")
      .insert(
        workforce.map((row) => ({ ...row, report_id: reportId, company_id: session.companyId })),
      );
    if (error) return { error: `Could not save the workforce rows: ${error.message}` };
  }

  if (plant.length) {
    const { error } = await supabase
      .from("plant_entries")
      .insert(
        plant.map((row) => ({ ...row, report_id: reportId, company_id: session.companyId })),
      );
    if (error) return { error: `Could not save the plant rows: ${error.message}` };
  }

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath(`/reports/${reportId}`);
  if (report?.project_id) revalidatePath(`/projects/${report.project_id}`);

  redirect(`/reports/${reportId}?saved=1`);
}

/** Deletes a draft. Finalised reports are immutable issued records. */
/**
 * Removes a report and everything stored for it.
 *
 * Two things stand in the way on purpose. A report that an issued Progress or
 * Completion Report is built on is that document's evidence, so deletion is
 * refused and the blocking documents are named - a cascade here would leave an
 * issued PDF citing a report that no longer exists. And an issued report needs
 * the confirmation typed rather than tapped.
 *
 * Storage is cleared explicitly. The database cascade removes the photo rows
 * but knows nothing about the buckets, so the files are collected first and
 * deleted after the row is gone; a file left behind is untidy, whereas a file
 * deleted before a failed delete would be lost from a report that still exists.
 */
export async function deleteReport(
  reportId: string,
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  if (!z.uuid().safeParse(reportId).success) return { error: "That report could not be found." };

  await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await withClockSkewRetry(() =>
    supabase
      .from("reports")
      .select("id, project_id, status, pdf_path")
      .eq("id", reportId)
      .maybeSingle(),
  );
  if (!report) return { error: "That report could not be found." };

  const dependents = await dependentsOfDailyReport(supabase, reportId);
  const check = canDelete({
    status: report.status,
    dependents,
    typedConfirmation: String(formData.get("confirmation") ?? ""),
  });
  if (!check.ok) return { error: check.message };

  const { data: photos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("report_id", reportId);

  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) return { error: `Could not delete the report: ${error.message}` };

  const photoPaths = (photos ?? []).map((row) => row.storage_path);
  if (photoPaths.length > 0) await supabase.storage.from("site-photos").remove(photoPaths);
  if (report.pdf_path) await supabase.storage.from(PDF_BUCKET).remove([report.pdf_path]);

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${report.project_id}`);
  redirect("/reports");
}
