import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, PHOTO_URL_TTL_SECONDS } from "@/lib/photos";

/**
 * Mints short-lived signed URLs for private photo objects.
 *
 * The bucket is deliberately not public: a public bucket would make every site
 * photo readable by anyone who learned the URL, which for construction defect
 * and safety photographs is not acceptable. Signed URLs are minted per render
 * and expire, so a copied link stops working.
 *
 * Returns a map of storage path to URL. A path that could not be signed is
 * simply absent, and callers render a placeholder rather than a broken image.
 */
export async function signPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
  }

  return urls;
}
