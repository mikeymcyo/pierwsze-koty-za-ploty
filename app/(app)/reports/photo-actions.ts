"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { describePhotograph } from "@/lib/ai/photo-description";
import { requireSessionContext } from "@/lib/auth/session";
import { PHOTO_STATUS_LABELS } from "@/lib/photo-captions";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, photoPathPrefix } from "@/lib/photos";
import { REPORT_IS_FINAL } from "@/lib/reports/immutability";

/**
 * Photo rows are written here, but the file itself is uploaded straight from
 * the browser to Supabase Storage.
 *
 * That split is deliberate. A Server Action receives its payload through the
 * Next.js server, which caps request bodies well below the bucket's 15 MB
 * limit, and routing megabytes of JPEG through the app server buys nothing:
 * storage RLS already restricts writes to the caller's own company folder, so
 * the browser upload is no less protected than a proxied one would be.
 *
 * The row is therefore created only once the object exists, and the path is
 * re-derived from the session here rather than trusted from the client.
 */

const attachSchema = z.object({
  projectId: z.uuid(),
  reportId: z.uuid().nullable(),
  storagePath: z.string().trim().min(1),
  caption: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .nullable(),
  category: z.enum([
    "work_completed",
    "before",
    "after",
    "defect",
    "safety",
    "progress",
    "delivery",
    "general",
  ]),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export type AttachPhotoInput = z.input<typeof attachSchema>;

export async function attachPhoto(input: AttachPhotoInput) {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "That photo could not be attached - please try again." };
  }

  const { projectId, reportId, storagePath, caption, category, width, height } = parsed.data;

  const session = await requireSessionContext();
  const supabase = await createClient();

  // The client tells us where it put the file, so check the path really is
  // inside this company's folder for this project before trusting it. Storage
  // RLS would have blocked a write elsewhere, but a row pointing at another
  // company's object must not be creatable either.
  if (!storagePath.startsWith(photoPathPrefix(session.companyId, projectId))) {
    return { error: "That photo could not be attached - please try again." };
  }

  // Photographs are part of what was issued, so an issued report takes no more
  // of them. A project-level photo carries no report and is unaffected.
  if (reportId) {
    const { data: report } = await supabase
      .from("reports")
      .select("status")
      .eq("id", reportId)
      .maybeSingle();
    if (report?.status === "final") return { error: REPORT_IS_FINAL };
  }

  const { error } = await supabase.from("photos").insert({
    company_id: session.companyId,
    project_id: projectId,
    report_id: reportId,
    storage_path: storagePath,
    caption,
    // Kept verbatim beside the caption the AI will later polish, the same way
    // reports.raw_notes sits beside the generated sections.
    original_caption: caption,
    category,
    width,
    height,
    uploaded_by: session.userId,
  });

  if (error) return { error: `Could not attach the photo: ${error.message}` };

  revalidatePath(`/projects/${projectId}`);
  if (reportId) revalidatePath(`/reports/${reportId}`);
  return {};
}

export async function deletePhoto(formData: FormData) {
  const photoId = String(formData.get("photoId") ?? "").trim();
  if (!photoId) return;

  await requireSessionContext();
  const supabase = await createClient();

  // Read the path first: once the row is gone we cannot find the object.
  const { data: photo } = await supabase
    .from("photos")
    .select("storage_path, project_id, report_id, reports(status)")
    .eq("id", photoId)
    .maybeSingle();

  if (!photo) return;

  // Removing a photograph from an issued report would leave the stored PDF
  // showing something the report no longer claims.
  const owner = Array.isArray(photo.reports) ? photo.reports[0] : photo.reports;
  if (owner?.status === "final") throw new Error(REPORT_IS_FINAL);

  const { error } = await supabase.from("photos").delete().eq("id", photoId);
  if (error) {
    throw new Error(`Could not delete the photo: ${error.message}`);
  }

  // The row is the source of truth, so a failure to remove the object leaves an
  // orphaned file rather than a broken thumbnail. Worth tidying eventually, not
  // worth failing the user's delete over.
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);

  revalidatePath(`/projects/${photo.project_id}`);
  if (photo.report_id) revalidatePath(`/reports/${photo.report_id}`);
}

const detailsSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(300, "Keep the caption short enough to read under the photograph")
    .transform((value) => (value.length > 0 ? value : null)),
  category: z.enum([
    "work_completed",
    "before",
    "after",
    "defect",
    "safety",
    "progress",
    "delivery",
    "general",
  ]),
});

export type PhotoDetailsState = { error?: string; saved?: boolean };

/**
 * The caption and status for one photograph.
 *
 * This is what stops a report printing the same word under twelve pictures:
 * the status is chosen per photograph rather than in bulk at upload, and the
 * caption is written by the person who was standing there. Both are editable
 * afterwards, because nobody types a good caption with wet gloves on.
 *
 * The retired enum values stay in the schema above deliberately. A photograph
 * saved years ago as `work_completed` must still validate if somebody only
 * edits its caption.
 */
export async function savePhotoDetails(
  photoId: string,
  _previous: PhotoDetailsState,
  formData: FormData,
): Promise<PhotoDetailsState> {
  if (!z.uuid().safeParse(photoId).success) return { error: "That photograph could not be found." };

  const parsed = detailsSchema.safeParse({
    caption: String(formData.get("caption") ?? ""),
    category: String(formData.get("category") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That could not be saved." };
  }

  await requireSessionContext();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("photos")
    .select("id, project_id, report_id, reports(status)")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: "That photograph could not be found." };

  // Same rule as deleting one: an issued report's stored PDF already says what
  // it says, and its captions must not drift away from it.
  const owner = Array.isArray(photo.reports) ? photo.reports[0] : photo.reports;
  if (owner?.status === "final") return { error: REPORT_IS_FINAL };

  const { error } = await supabase
    .from("photos")
    .update({ caption: parsed.data.caption, category: parsed.data.category })
    .eq("id", photoId);
  if (error) return { error: `Could not save the photograph: ${error.message}` };

  revalidatePath(`/projects/${photo.project_id}`);
  if (photo.report_id) revalidatePath(`/reports/${photo.report_id}`);
  return { saved: true };
}

export type PhotoDescriptionState = { description?: string; error?: string };

/**
 * Proposes an AI description for one photograph, and writes nothing.
 *
 * This is the whole safety contract in one place. The sentence is returned to
 * the browser and shown as a suggestion; the caption in the database changes
 * only if the user then presses Save, exactly as it would had they typed it.
 * A caption somebody wrote by hand can therefore never be replaced by a model,
 * and abandoning the suggestion costs nothing.
 *
 * The photograph's own caption is handed to the model as context so a
 * regeneration builds on what the user meant, and the day's notes go with it
 * as background - labelled as background, because a note about the first floor
 * is not evidence that this photograph shows the first floor.
 */
export async function describePhotoAction(
  photoId: string,
  _previous: PhotoDescriptionState,
  _formData: FormData,
): Promise<PhotoDescriptionState> {
  if (!z.uuid().safeParse(photoId).success) return { error: "That photograph could not be found." };

  await requireSessionContext();
  const supabase = await createClient();

  // RLS scopes this to the caller's own company, so another tenant's
  // photograph is simply not found rather than refused.
  const { data: photo } = await supabase
    .from("photos")
    .select(
      "id, caption, category, storage_path, report_id, projects(name, client, site_address), reports(report_date, raw_notes)",
    )
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: "That photograph could not be found." };

  const { data: file } = await supabase.storage.from(PHOTO_BUCKET).download(photo.storage_path);
  if (!file) return { error: "That photograph could not be read from storage." };

  const project = Array.isArray(photo.projects) ? photo.projects[0] : photo.projects;
  const report = Array.isArray(photo.reports) ? photo.reports[0] : photo.reports;

  // What the report already says, in its own words. A caption on a report
  // whose works section names a drainage run should say drainage run rather
  // than "a trench" - that is the difference between a record and a
  // description of a picture.
  // Only where the photograph belongs to a report. A project photograph has no
  // report to read, and asking for one with a null id is an error rather than
  // an empty answer.
  const { data: sections } = photo.report_id
    ? await supabase
        .from("report_sections")
        .select("section_type, content")
        .eq("report_id", photo.report_id)
        .order("sort_order", { ascending: true })
    : { data: [] };
  const writtenSections = (sections ?? [])
    .filter((section) => section.content?.trim())
    .map((section) => `${section.section_type.replaceAll("_", " ")}: ${section.content?.trim()}`)
    .join("\n");

  const result = await describePhotograph(
    {
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || "image/jpeg",
    },
    {
      projectName: project?.name ?? "Project",
      client: project?.client ?? null,
      siteAddress: project?.site_address ?? null,
      reportDate: report?.report_date ?? null,
      statusLabel: PHOTO_STATUS_LABELS[photo.category] ?? null,
      existingCaption: photo.caption,
      reportContext: report?.raw_notes?.trim() || null,
      writtenSections: writtenSections || null,
    },
  );

  return result.ok ? { description: result.description } : { error: result.error };
}
