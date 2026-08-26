import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Supabase mints access tokens in GoTrue but validates them in PostgREST, and
 * those two services do not share a clock exactly. A request made moments after
 * a token is issued can be rejected with "JWT issued at future", because the
 * token's `iat` is slightly ahead of the validating service.
 *
 * This is not a clock problem on our side - the app server and Supabase agree
 * to within a second. It lands almost exclusively on the first request after
 * signup or sign-in, where the app redirects and queries immediately, and it
 * clears on its own within a few seconds.
 *
 * Measured skew varies between under a second and a few seconds, so the retry
 * is bounded by a deadline rather than a fixed number of attempts.
 */
function isTransientClockError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const message = `${error.message ?? ""} ${error.hint ?? ""}`;
  return /issued at future|not yet valid|iat.*future/i.test(message);
}

type Query<T> = () => PromiseLike<{ data: T; error: PostgrestError | null }>;

const DEFAULT_BUDGET_MS = 6_000;
const FIRST_DELAY_MS = 200;
const MAX_DELAY_MS = 1_000;

/**
 * Runs a Supabase query, retrying only the clock-skew case above until the
 * budget is spent.
 *
 * Every other error is returned untouched on the first attempt, so genuine
 * failures still surface immediately rather than being hidden behind delays.
 * Reads only: a retried write would not be safe.
 */
export async function withClockSkewRetry<T>(
  query: Query<T>,
  { budgetMs = DEFAULT_BUDGET_MS }: { budgetMs?: number } = {},
): Promise<{ data: T; error: PostgrestError | null }> {
  const deadline = Date.now() + budgetMs;
  let delay = FIRST_DELAY_MS;

  let result = await query();

  while (isTransientClockError(result.error) && Date.now() + delay < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await query();
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  }

  return result;
}
