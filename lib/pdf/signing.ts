import { createClient } from "@/lib/supabase/server";

/** Long enough to open and save on a phone, short enough that a copied link dies. */
export const PDF_URL_TTL_SECONDS = 60 * 10;

export const PDF_BUCKET = "report-pdfs";

/**
 * Mints a short-lived signed URL for a finalised report's PDF.
 *
 * The bucket is private for the same reason the photo bucket is: a progress
 * report names a client, a site and a workforce, and anyone who learned the
 * URL of a public object could read it. Signed per render and expiring, so a
 * link forwarded out of an email stops working.
 */
export async function signPdfUrl(path: string | null): Promise<string | null> {
  if (!path) return null;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(PDF_BUCKET)
    .createSignedUrl(path, PDF_URL_TTL_SECONDS);

  return data?.signedUrl ?? null;
}
