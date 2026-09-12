import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { REPORT_IS_FINAL } from "@/lib/reports/immutability";
import { createClient } from "@/lib/supabase/server";

export type ReportFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type SaveCaptureResult =
  | { ok: true; projectId: string; rawNotes: string | null }
  | { ok: false; state: ReportFormState };

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
 * Saves the capture form: the notes, the date and weather, the workforce and
 * plant rows.
 *
 * Shared by "Save draft" and by "Write my report", which saves the same form
 * before it drafts - so what the model reads is what is on the screen, and a
 * person never has to save first and then write. Nothing here redirects; the
 * two actions decide that for themselves.
 *
 * Workforce and plant are replaced wholesale rather than diffed: rows have no
 * stable client-side identity once one is removed from the middle, and a report
 * carries a handful of rows, not thousands. Validation runs before anything is
 * deleted so a rejected submission cannot lose the existing rows.
 */
export async function saveCapture(reportId: string, formData: FormData): Promise<SaveCaptureResult> {
  const parsed = reportSchema.safeParse({
    report_date: formData.get("report_date") ?? "",
    weather: formData.get("weather") ?? "",
    raw_notes: formData.get("raw_notes") ?? "",
  });
  if (!parsed.success) return { ok: false, state: { fieldErrors: fieldErrorsOf(parsed.error) } };

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

  if (reportError) {
    return { ok: false, state: { error: `Could not save the report: ${reportError.message}` } };
  }

  // No row came back: either it is not ours, which RLS decided, or it has been
  // finalised. Nothing below may run in either case - the workforce and plant
  // rows are replaced by deleting them first, and that would empty an issued
  // report.
  if (!report) return { ok: false, state: { error: REPORT_IS_FINAL } };

  const [{ error: workforceDeleteError }, { error: plantDeleteError }] = await Promise.all([
    supabase.from("workforce_entries").delete().eq("report_id", reportId),
    supabase.from("plant_entries").delete().eq("report_id", reportId),
  ]);

  const deleteError = workforceDeleteError ?? plantDeleteError;
  if (deleteError) {
    return { ok: false, state: { error: `Could not save the report: ${deleteError.message}` } };
  }

  if (workforce.length) {
    const { error } = await supabase
      .from("workforce_entries")
      .insert(
        workforce.map((row) => ({ ...row, report_id: reportId, company_id: session.companyId })),
      );
    if (error) {
      return { ok: false, state: { error: `Could not save the workforce rows: ${error.message}` } };
    }
  }

  if (plant.length) {
    const { error } = await supabase
      .from("plant_entries")
      .insert(
        plant.map((row) => ({ ...row, report_id: reportId, company_id: session.companyId })),
      );
    if (error) {
      return { ok: false, state: { error: `Could not save the plant rows: ${error.message}` } };
    }
  }

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/projects/${report.project_id}`);

  return { ok: true, projectId: report.project_id, rawNotes: parsed.data.raw_notes };
}
