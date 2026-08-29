import "server-only";

import { PDF_BUCKET } from "@/lib/pdf/signing";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The stored, issued PDF, exactly as it was written.
 *
 * Downloaded from the private bucket under the caller's own session, so the
 * storage policies apply as they always do. Null where the object is gone,
 * which the caller turns into a 404 rather than an exception.
 */
export async function storedPdf(supabase: Client, path: string): Promise<Buffer | null> {
  const { data } = await supabase.storage.from(PDF_BUCKET).download(path);
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}
