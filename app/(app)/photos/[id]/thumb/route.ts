import { NextResponse } from "next/server";

import { requireSessionContext } from "@/lib/auth/session";
import { PHOTO_BUCKET, thumbnailPath } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";

/**
 * The small copy of a photograph, for the screens.
 *
 * Every grid, picker and arrange view on the app fetches its tiles from here
 * rather than from a signed Supabase URL, for two reasons.
 *
 * The first is size. A stored site photograph is 1200x1600 and around 700 kB,
 * and every screen was pulling all of it into a tile a couple of hundred
 * pixels wide. The thumbnail written beside it at upload is a fifteenth of
 * that. The PDF is untouched by any of this - it is built from the original
 * object, and this route is not in that path.
 *
 * The second is caching, which was the worse of the two. A Supabase signed URL
 * carries a token minted at the moment of signing, so the same photograph on
 * the same screen produced a different URL on every render and the browser
 * cache missed every single time: opening a report twice downloaded every
 * photograph twice. This URL is derived from the photograph's id and never
 * changes, and the object behind it is immutable - the path is a uuid minted
 * once, rotation is presentation only, and a replaced photograph is a new row
 * with a new id. So the bytes can be kept for as long as the browser likes.
 *
 * Private, not public. The cache directive is `private`, so a shared cache
 * must not keep it, and the row is read under the caller's own session: RLS
 * confines public.photos to the caller's company, and a photograph belonging
 * to another one is simply not found. There is no company id in the URL to get
 * wrong, because the URL does not decide who may see it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await requireSessionContext();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("photos")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!photo?.storage_path) return new NextResponse("Not found", { status: 404 });

  // Photographs uploaded before thumbnails existed have none, and so does one
  // whose canvas could not make it. Serving the photograph itself is the same
  // picture at the same shape - it only costs more - so the screen is never
  // the thing that breaks.
  const thumb = await supabase.storage.from(PHOTO_BUCKET).download(thumbnailPath(photo.storage_path));
  const file = thumb.data
    ? thumb.data
    : (await supabase.storage.from(PHOTO_BUCKET).download(photo.storage_path)).data;

  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(await file.arrayBuffer()), {
    headers: {
      "content-type": file.type || "image/jpeg",
      // Immutable, and private to the browser that asked. Nothing in between
      // may keep a site photograph.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
