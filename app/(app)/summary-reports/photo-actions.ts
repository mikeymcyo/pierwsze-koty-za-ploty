"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { photoPathPrefix } from "@/lib/photos";
import { SUMMARY_REPORT_IS_FINAL } from "@/lib/summary-reports/finalisation";
import { createClient } from "@/lib/supabase/server";

/**
 * Photographs taken from inside a report.
 *
 * Underneath, nothing new: the file goes to the same private bucket under the
 * same {company}/{project}/ prefix with the same storage RLS, and the row goes
 * into the same `photos` table. What these add is the link - a photograph
 * taken while writing a survey is part of that survey's evidence the moment it
 * is taken, rather than something to go and find on the project afterwards.
 *
 * There is no second photo system here, and no migration: `summary_report_photos`
 * already exists and already carries the caption override and the print order.
 */

const CATEGORIES = [
  "work_completed",
  "before",
  "after",
  "defect",
  "safety",
  "progress",
  "delivery",
  "general",
] as const;

const attachSchema = z.object({
  summaryReportId: z.uuid(),
  storagePath: z.string().trim().min(1),
  caption: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .nullable(),
  category: z.enum(CATEGORIES),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export type AttachSummaryPhotoInput = z.input<typeof attachSchema>;

/**
 * The report this photograph belongs to, if the caller may still add to it.
 *
 * RLS scopes the read to the caller's company, so a missing row means "not
 * yours" as much as "not there" and both answer the same way.
 */
async function editableReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  const { data: report } = await supabase
    .from("summary_reports")
    .select("project_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { ok: false, error: "That report could not be found." };
  // An issued document's photographs are part of what was issued.
  if (report.status === "final") return { ok: false, error: SUMMARY_REPORT_IS_FINAL };
  return { ok: true, projectId: report.project_id };
}

/** The next print position, so a new plate lands after the ones already there. */
async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
): Promise<number> {
  const { data } = await supabase
    .from("summary_report_photos")
    .select("sort_order")
    .eq("summary_report_id", reportId)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (data?.[0]?.sort_order ?? -1) + 1;
}

/**
 * Records a photograph uploaded from inside a report, and includes it.
 *
 * The file is already in the bucket - the browser puts it there directly, the
 * same as everywhere else in this application, because a Server Action body is
 * capped well below the bucket's own limit. The path is checked against the
 * session's own company and this report's project before it is trusted: RLS
 * would have refused a write elsewhere, but a row pointing at another
 * company's object must not be creatable either.
 */
export async function attachSummaryPhoto(input: AttachSummaryPhotoInput) {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { error: "That photo could not be attached - please try again." };

  const { summaryReportId, storagePath, caption, category, width, height } = parsed.data;
  const session = await requireSessionContext();
  const supabase = await createClient();

  const report = await editableReport(supabase, summaryReportId);
  if (!report.ok) return { error: report.error };

  if (!storagePath.startsWith(photoPathPrefix(session.companyId, report.projectId))) {
    return { error: "That photo could not be attached - please try again." };
  }

  // report_id stays null: this belongs to the project, and to this document
  // through the link below. It is not a Daily Report photograph.
  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .insert({
      company_id: session.companyId,
      project_id: report.projectId,
      report_id: null,
      storage_path: storagePath,
      caption,
      original_caption: caption,
      category,
      width,
      height,
      uploaded_by: session.userId,
    })
    .select("id")
    .single();
  if (photoError) return { error: `Could not attach the photo: ${photoError.message}` };

  const { error: linkError } = await supabase.from("summary_report_photos").insert({
    company_id: session.companyId,
    summary_report_id: summaryReportId,
    photo_id: photo.id,
    sort_order: await nextSortOrder(supabase, summaryReportId),
  });
  // The photograph is safely on the project either way. Saying so is better
  // than pretending it was included when it was not.
  if (linkError) {
    return { error: `Uploaded, but not added to this report: ${linkError.message}` };
  }

  revalidatePath(`/summary-reports/${summaryReportId}`);
  revalidatePath(`/projects/${report.projectId}`);
  return {};
}

export type SummaryPhotoState = { error?: string; saved?: boolean };

/** Adds photographs already on the project to this report. */
export async function linkSummaryPhotos(
  reportId: string,
  _previous: SummaryPhotoState,
  formData: FormData,
): Promise<SummaryPhotoState> {
  const requested = formData.getAll("photoId").map(String).filter(Boolean);
  if (requested.length === 0) return { saved: true };

  const session = await requireSessionContext();
  const supabase = await createClient();
  const report = await editableReport(supabase, reportId);
  if (!report.ok) return { error: report.error };

  // Only photographs on this report's own project, checked here rather than
  // trusted from the form.
  const { data: photos } = await supabase
    .from("photos")
    .select("id")
    .eq("project_id", report.projectId)
    .in("id", requested);
  if (!photos?.length) return { error: "Those photographs could not be found." };

  const { data: existing } = await supabase
    .from("summary_report_photos")
    .select("photo_id")
    .eq("summary_report_id", reportId);
  const already = new Set((existing ?? []).map((row) => row.photo_id));
  const adding = photos.filter((photo) => !already.has(photo.id));
  if (adding.length === 0) return { saved: true };

  const start = await nextSortOrder(supabase, reportId);
  const { error } = await supabase.from("summary_report_photos").insert(
    adding.map((photo, index) => ({
      company_id: session.companyId,
      summary_report_id: reportId,
      photo_id: photo.id,
      sort_order: start + index,
    })),
  );
  if (error) return { error: `Could not add the photographs: ${error.message}` };

  revalidatePath(`/summary-reports/${reportId}`);
  return { saved: true };
}

/**
 * Takes a photograph out of this report.
 *
 * Only the link goes. The photograph stays on the project, with its caption
 * and its file, because removing it from one document is not a reason to
 * destroy evidence that other documents - or a dispute a year from now - may
 * still need. Deleting a photograph outright is on the project, where what is
 * about to be lost can be seen.
 */
export async function removeSummaryPhoto(
  reportId: string,
  _previous: SummaryPhotoState,
  formData: FormData,
): Promise<SummaryPhotoState> {
  const photoId = String(formData.get("photoId") ?? "").trim();
  if (!z.uuid().safeParse(photoId).success) {
    return { error: "That photograph could not be found." };
  }

  const supabase = await createClient();
  const report = await editableReport(supabase, reportId);
  if (!report.ok) return { error: report.error };

  const { error } = await supabase
    .from("summary_report_photos")
    .delete()
    .eq("summary_report_id", reportId)
    .eq("photo_id", photoId);
  if (error) return { error: `Could not remove the photograph: ${error.message}` };

  revalidatePath(`/summary-reports/${reportId}`);
  return { saved: true };
}
