"use server";

import { revalidatePath } from "next/cache";

import { requireSessionContext } from "@/lib/auth/session";
import { parseRecentKey } from "@/lib/stores/recent";
import { createClient } from "@/lib/supabase/server";

/**
 * Takes one store off the signed-in user's recent list.
 *
 * Their own row and nothing else: the user id is the session's, and the row
 * is named by the same two keys it was written under. Nothing but the
 * history row changes - the store is still in the directory, and any project
 * at it is untouched.
 */
export async function removeRecentLocation(formData: FormData): Promise<void> {
  const key = parseRecentKey({ directory: formData.get("directory"), code: formData.get("code") });
  if (!key) return;

  const session = await requireSessionContext();
  const supabase = await createClient();
  await supabase
    .from("recent_locations")
    .delete()
    .eq("user_id", session.userId)
    .eq("directory", key.directory)
    .eq("code", key.code);

  revalidatePath("/stores");
}
