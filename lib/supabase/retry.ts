import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Supabase mints access tokens in GoTrue but validates them in PostgREST, and
 * those two services do not share a clock exactly. A request made in the same
 * moment the token is issued can therefore be rejected with "JWT issued at
 * future", because the token's `iat` is a fraction of a second ahead of the
 * validating service.
 *
 * In practice this lands almost exclusively on the first request after signup
 * or sign-in, where the app redirects and queries immediately. It clears on its
 * own within a second.
 */
function isTransientClockError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const message = `${error.message ?? ""} ${error.hint ?? ""}`;
  return /issued at future|not yet valid|iat.*future/i.test(message);
}

type Query<T> = () => PromiseLike<{ data: T; error: PostgrestError | null }>;

/**
 * Runs a Supabase query, retrying only the clock-skew case above.
 *
 * Every other error is returned untouched on the first attempt, so genuine
 * failures still surface immediately rather than being hidden behind delays.
 * Only use this for reads: a retried write would not be safe.
 */
export async function withClockSkewRetry<T>(
  query: Query<T>,
  { attempts = 3, delayMs = 300 }: { attempts?: number; delayMs?: number } = {},
): Promise<{ data: T; error: PostgrestError | null }> {
  let result = await query();

  for (let attempt = 1; attempt < attempts && isTransientClockError(result.error); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    result = await query();
  }

  return result;
}
