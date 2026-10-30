"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { attachPoFile, type AttachJobPoInput } from "@/lib/jobs/attach-po";
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

  const session = await requireSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      status: parsed.data.status,
      done_at: parsed.data.status === "done" ? new Date().toISOString() : null,
    })
    .eq("company_id", session.companyId)
    .eq("id", parsed.data.jobId)
    .select("id")
    .maybeSingle();
  if (error) return { error: `Could not update the job: ${error.message}` };
  if (!data) return { error: "That job could not be found." };

  revalidatePath("/jobs");
  return { saved: true };
}

export type { AttachJobPoInput } from "@/lib/jobs/attach-po";

export async function attachJobPo(input: AttachJobPoInput): Promise<{ error?: string; saved?: boolean }> {
  const session = await requireSessionContext();
  const supabase = await createClient();
  const result = await attachPoFile(supabase, session.companyId, input);
  if (result.saved) revalidatePath("/jobs");
  return result;
}
