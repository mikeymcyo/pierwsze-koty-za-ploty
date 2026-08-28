"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { displayName, requireSessionContext } from "@/lib/auth/session";
import { REPORT_IS_FINAL } from "@/lib/reports/immutability";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";

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
 * Copies workforce and plant from the project's most recent other report.
 *
 * Best effort on purpose: a failure here costs the user some retyping, which is
 * not a reason to fail creating the report they asked for.
 */
async function copyPreviousEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  reportId: string,
  companyId: string,
) {
  const { data: previous } = await supabase
    .from("reports")
    .select("id")
    .eq("project_id", projectId)
    .neq("id", reportId)
    .order("report_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!previous) return;

  const [{ data: workforce }, { data: plant }] = await Promise.all([
    supabase
      .from("workforce_entries")
      .select("company_name, trade, operatives, sort_order")
      .eq("report_id", previous.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("plant_entries")
      .select("description, quantity, sort_order")
      .eq("report_id", previous.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (workforce?.length) {
    await supabase
      .from("workforce_entries")
      .insert(workforce.map((row) => ({ ...row, report_id: reportId, company_id: companyId })));
  }

  if (plant?.length) {
    await supabase
      .from("plant_entries")
      .insert(plant.map((row) => ({ ...row, report_id: reportId, company_id: companyId })));
  }
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

/** Deletes a draft. Finalised reports are kept; Phase 6 owns that transition. */
export async function deleteReport(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "").trim();
  if (!reportId) return;

  await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await withClockSkewRetry(() =>
    supabase.from("reports").select("project_id").eq("id", reportId).maybeSingle(),
  );

  const { error } = await supabase
    .from("reports")
    .delete()
    .eq("id", reportId)
    .eq("status", "draft");

  if (error) {
    throw new Error(`Could not delete the report: ${error.message}`);
  }

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  if (report?.project_id) revalidatePath(`/projects/${report.project_id}`);
  redirect("/reports");
}
