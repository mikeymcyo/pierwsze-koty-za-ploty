import { z } from "zod";

export const viewpointSchema = z.object({
  directoryId: z.literal("lidl-gb"),
  code: z.string().regex(/^\d+$/),
  latitude: z.number().finite().min(49).max(61),
  longitude: z.number().finite().min(-9).max(2),
  heading: z.number().finite().min(0).max(360),
  pitch: z.number().finite().min(-90).max(90),
  fov: z.number().finite().min(10).max(100),
  reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type StoreViewpoint = z.infer<typeof viewpointSchema>;
const codeKey = (code: string) => code.replace(/^0+(?=\d)/, "");

/** A bad or oversized pilot list disables the feature rather than widening access. */
export function parseViewpoints(input: unknown): StoreViewpoint[] {
  const parsed = z.array(viewpointSchema).max(20).safeParse(input);
  if (!parsed.success) return [];
  const keys = parsed.data.map((v) => `${v.directoryId}:${codeKey(v.code)}`);
  return new Set(keys).size === keys.length ? parsed.data : [];
}

export function streetViewFor(
  viewpoints: unknown,
  directoryId: string,
  code: string,
  env: { VERCEL_ENV?: string; STOREVISION_ENABLED?: string; GOOGLE_MAPS_EMBED_BROWSER_KEY?: string },
): { embedUrl: string; mapsUrl: string } | null {
  if (env.VERCEL_ENV !== "preview" || env.STOREVISION_ENABLED !== "true") return null;
  const key = env.GOOGLE_MAPS_EMBED_BROWSER_KEY?.trim();
  if (!key) return null;
  const view = parseViewpoints(viewpoints).find((v) => v.directoryId === directoryId && codeKey(v.code) === codeKey(code));
  if (!view) return null;
  const location = `${view.latitude},${view.longitude}`;
  const embed = new URL("https://www.google.com/maps/embed/v1/streetview");
  embed.search = new URLSearchParams({ key, location, heading: String(view.heading), pitch: String(view.pitch), fov: String(view.fov), language: "en", region: "GB" }).toString();
  const maps = new URL("https://www.google.com/maps/@");
  maps.search = new URLSearchParams({ api: "1", map_action: "pano", viewpoint: location, heading: String(view.heading), pitch: String(view.pitch), fov: String(view.fov) }).toString();
  return { embedUrl: embed.href, mapsUrl: maps.href };
}
