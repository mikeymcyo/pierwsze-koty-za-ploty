import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";
import { JOB_PO_BUCKET } from "./jobs";
import { MAX_PO_PDF_BYTES } from "./po-files";

const attachSchema = z.object({
  poId: z.uuid(),
  storagePath: z.string().trim().min(1),
  expectedStoragePath: z.string().nullable(),
  originalFilename: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_PO_PDF_BYTES),
});

export type AttachJobPoInput = z.input<typeof attachSchema>;

/** Verify the fresh upload, then move the PO only if its old file still matches. */
export async function attachPoFile(
  supabase: SupabaseClient<Database>,
  companyId: string,
  input: AttachJobPoInput,
): Promise<{ error?: string; saved?: boolean }> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { error: "That PDF could not be attached. Please try again." };
  const { poId, storagePath, expectedStoragePath, originalFilename, fileSize } = parsed.data;
  const { data: existing, error: readError } = await supabase
    .from("job_pos")
    .select("id, job_id, storage_path")
    .eq("company_id", companyId)
    .eq("id", poId)
    .maybeSingle();
  if (readError) return { error: "Could not read the PO. Please try again." };
  if (!existing) return { error: "That PO could not be found." };
  if (existing.storage_path !== expectedStoragePath) {
    return { error: "This PO's PDF changed elsewhere. Reload before replacing it." };
  }

  const folder = `${companyId}/${existing.job_id}`;
  const prefix = `${folder}/${poId}-`;
  const uploadId = storagePath.slice(prefix.length, -4);
  if (!storagePath.startsWith(prefix) || !storagePath.endsWith(".pdf") ||
      !z.uuid().safeParse(uploadId).success || storagePath === existing.storage_path) {
    return { error: "That file does not belong to this PO's new upload." };
  }

  const name = storagePath.slice(folder.length + 1);
  const { data: files, error: listError } = await supabase.storage
    .from(JOB_PO_BUCKET).list(folder, { search: name, limit: 5 });
  const uploaded = files?.find((file) => file.name === name);
  if (listError || !uploaded || Number(uploaded.metadata?.size) !== fileSize ||
      uploaded.metadata?.mimetype !== "application/pdf") {
    return { error: "The PDF did not finish uploading. Your previous PDF is unchanged. Please try again." };
  }

  let update = supabase.from("job_pos")
    .update({ storage_path: storagePath, original_filename: originalFilename,
      file_size: fileSize, attached_at: new Date().toISOString() })
    .eq("company_id", companyId).eq("id", poId);
  update = expectedStoragePath === null
    ? update.is("storage_path", null)
    : update.eq("storage_path", expectedStoragePath);
  const { data: moved, error: updateError } = await update.select("id").maybeSingle();
  if (updateError) return { error: "Could not attach the PDF. Please try again." };
  if (!moved) return { error: "This PO changed while uploading. Reload and try again." };

  if (existing.storage_path) {
    await supabase.storage.from(JOB_PO_BUCKET).remove([existing.storage_path]).catch(() => undefined);
  }
  return { saved: true };
}
