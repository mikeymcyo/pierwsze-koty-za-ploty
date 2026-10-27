"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { JOB_PO_BUCKET } from "@/lib/jobs/jobs";
import { createClient } from "@/lib/supabase/server";

export type JobActionState = { error?: string; saved?: boolean };

/**
 * Open or Done. Done hides the job from the main list; Reopen brings it back.
 * RLS confines both to the caller's own company, so a foreign id updates
 * nothing and is reported as not found.
 */
export async function setJobStatus(
  _previous: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const parsed = z
    .object({ jobId: z.uuid(), status: z.enum(["open", "done"]) })
    .safeParse({ jobId: formData.get("jobId"), status: formData.get("status") });
  if (!parsed.success) return { error: "That job could not be found." };

  await requireSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      status: parsed.data.status,
      done_at: parsed.data.status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.jobId)
    .select("id")
    .maybeSingle();
  if (error) return { error: `Could not update the job: ${error.message}` };
  if (!data) return { error: "That job could not be found." };

  revalidatePath("/jobs");
  return { saved: true };
}

const attachSchema = z.object({
  poId: z.uuid(),
  storagePath: z.string().trim().min(1),
  originalFilename: z.string().trim().min(1),
  fileSize: z.number().int().nonnegative().nullable(),
});

export type AttachJobPoInput = z.input<typeof attachSchema>;

/**
 * Records the PDF just uploaded for a purchase order.
 *
 * The bytes are already in the bucket - the browser put them there under the
 * company's own folder, which the storage policy allowed because the caller
 * is a member. This writes the path onto the PO row and, where a PDF was
 * attached before, removes the old object: the new file is a new object, never
 * one written over in place.
 */
export async function attachJobPo(input: AttachJobPoInput): Promise<{ error?: string; saved?: boolean }> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { error: "That PO could not be found." };

  const session = await requireSessionContext();
  const supabase = await createClient();

  // The path must sit in this company's folder: a path pointing elsewhere is
  // refused rather than recorded.
  if (!parsed.data.storagePath.startsWith(`${session.companyId}/`)) {
    return { error: "That file is not in this company's folder." };
  }

  const { data: existing, error: readError } = await supabase
    .from("job_pos")
    .select("id, storage_path")
    .eq("id", parsed.data.poId)
    .maybeSingle();
  if (readError) return { error: `Could not read the PO: ${readError.message}` };
  if (!existing) return { error: "That PO could not be found." };

  const { error } = await supabase
    .from("job_pos")
    .update({
      storage_path: parsed.data.storagePath,
      original_filename: parsed.data.originalFilename,
      file_size: parsed.data.fileSize,
      attached_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.poId);
  if (error) return { error: `Could not attach the PDF: ${error.message}` };

  // Best effort: the old file is orphaned, not wrong, if this fails.
  if (existing.storage_path && existing.storage_path !== parsed.data.storagePath) {
    await supabase.storage.from(JOB_PO_BUCKET).remove([existing.storage_path]);
  }

  revalidatePath("/jobs");
  return { saved: true };
}
