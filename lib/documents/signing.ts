import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_BUCKET, DOCUMENT_URL_TTL_SECONDS } from "@/lib/documents/metadata";

/**
 * Mints short-lived signed URLs for private document objects.
 *
 * The bucket is deliberately not public: a drawing set, a RAMS or a client
 * instruction is not information to leave readable by anyone who learns the
 * URL. Signed URLs are minted per render and expire, so a copied link stops
 * working.
 *
 * Returns a map of storage path to URL. A path that could not be signed is
 * simply absent, and callers say the file could not be reached rather than
 * offering a link that will fail.
 */
export async function signDocumentUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrls(paths, DOCUMENT_URL_TTL_SECONDS);

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
  }

  return urls;
}
