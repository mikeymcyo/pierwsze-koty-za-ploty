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
 *
 * Nothing calls this at the moment, and a screen showing photographs should
 * not start. The token is minted fresh on every signing, so the URL changes on
 * every render and the browser cache misses every time - opening a report
 * twice used to download every photograph twice. Screens fetch their tiles
 * from /photos/[id]/thumb instead, which is stable and cacheable; see
 * app/(app)/photos/[id]/thumb/route.ts. Kept for the day something genuinely
 * needs to hand a Supabase URL to a client that is not our own origin.
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
