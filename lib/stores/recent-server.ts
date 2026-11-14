import "server-only";

import { requireSessionContext } from "@/lib/auth/session";
import { directoryById } from "@/lib/stores/catalogue";
import type { ResolvedStore } from "@/lib/stores/directory";
import { RECENT_LIMIT, knownStore, parseRecentKey, recentRows } from "@/lib/stores/recent";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** The catalogue's lookup in the shape lib/stores/recent.ts asks for. */
function storeIn(directory: string, code: string): ResolvedStore | null {
  const loaded = directoryById(directory);
  if (!loaded) return null;
  return loaded.stores.find((store) => store.code === code) ?? null;
}

export type RecordOutcome = { ok: true } | { ok: false; reason: "invalid" | "unknown" | "failed" };

/**
 * Records that the signed-in user opened this store or asked the way to it.
 *
 * `user_id` is the session's and nothing else: the client names a directory
 * and a store code, both are checked for shape and then against the shipped
 * directory, and only a store this build actually knows is written. One row
 * per user and store - the upsert on the primary key moves a revisit to the
 * top - and anything past the limit is trimmed on the way out, so the table
 * cannot grow past twenty rows per person however long they use it.
 */
export async function recordRecentLocation(
  input: { directory?: unknown; code?: unknown },
  supabaseIn?: Client,
): Promise<RecordOutcome> {
  const key = parseRecentKey(input);
  if (!key) return { ok: false, reason: "invalid" };
  if (!knownStore(key, storeIn)) return { ok: false, reason: "unknown" };

  const session = await requireSessionContext();
  const supabase = supabaseIn ?? (await createClient());

  const { error } = await supabase.from("recent_locations").upsert(
    {
      user_id: session.userId,
      directory: key.directory,
      code: key.code,
      visited_at: new Date().toISOString(),
    },
    { onConflict: "user_id,directory,code" },
  );
  if (error) return { ok: false, reason: "failed" };

  // Keep the newest twenty. Read past the limit and delete the tail; RLS
  // scopes both to this user, and the composite key names each row exactly.
  const { data: overflow } = await supabase
    .from("recent_locations")
    .select("directory, code")
    .eq("user_id", session.userId)
    .order("visited_at", { ascending: false })
    .range(RECENT_LIMIT, RECENT_LIMIT + 49);
  for (const row of overflow ?? []) {
    await supabase
      .from("recent_locations")
      .delete()
      .eq("user_id", session.userId)
      .eq("directory", row.directory)
      .eq("code", row.code);
  }

  return { ok: true };
}

export type RecentLocation = { store: ResolvedStore; visitedAt: string };

/**
 * The signed-in user's recent stores, newest first, resolved against the
 * shipped directory. A row whose store is no longer in the directory is
 * dropped rather than shown as a blank.
 */
export async function loadRecentLocations(supabase: Client, userId: string): Promise<RecentLocation[]> {
  const { data } = await supabase
    .from("recent_locations")
    .select("directory, code, visited_at")
    .eq("user_id", userId)
    .order("visited_at", { ascending: false })
    .limit(RECENT_LIMIT);

  const resolved = (data ?? []).flatMap((row) => {
    const store = storeIn(row.directory, row.code);
    return store ? [{ store, visitedAt: row.visited_at }] : [];
  });
  return recentRows(resolved);
}
