"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, photoPathPrefix } from "@/lib/photos";

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
    .select("storage_path, project_id, report_id")
    .eq("id", photoId)
    .maybeSingle();

  if (!photo) return;

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
