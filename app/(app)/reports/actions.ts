"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { displayName, requireSessionContext } from "@/lib/auth/session";
import { PDF_BUCKET } from "@/lib/pdf/signing";
import { copyPreviousEntries } from "@/lib/reports/carry-over";
import { dependentsOfDailyReport } from "@/lib/reports/dependents";
import { canDelete } from "@/lib/reports/lifecycle";
import { saveCapture, type ReportFormState } from "@/lib/reports/save-capture";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";

export type DeleteState = { error?: string };

export type { ReportFormState } from "@/lib/reports/save-capture";

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
 * Saves the capture screen and reopens it with "Draft saved."
 *
 * The saving itself is lib/reports/save-capture.ts, shared with "Write my
 * report" so that the notes a person can see are the notes the model reads.
 */
export async function saveReport(
  reportId: string,
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const saved = await saveCapture(reportId, formData);
  if (!saved.ok) return saved.state;

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
