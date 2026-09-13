/**
 * What to tell a person when a call to the model fails.
 *
 * Pure, with no runtime imports and no path aliases, so the mapping can be
 * tested with a hand-made error and no key.
 *
 * Every AI entry point used to say "could not be reached" for anything that
 * was not a rejected key, and on 13 September that sent the owner looking for
 * a network fault when OpenAI had answered in two seconds with HTTP 429
 * `insufficient_quota` / `credit_balance_exhausted`: the account was out of
 * credit. The fix for that is on a billing page, not on site, so the message
 * has to say so.
 *
 * The OpenAI SDK throws an APIError carrying `status`, `code` and `type`
 * alongside the message; a plain Error with the same words in it is read the
 * same way, so nothing depends on the SDK's class.
 */
export const AI_OUT_OF_CREDIT =
  "The AI account has run out of credit. Add credit to the OpenAI API billing account, then try again.";

export const AI_KEY_REJECTED = "The AI key was rejected. Check OPENAI_API_KEY.";

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  code?: unknown;
  type?: unknown;
};

function fields(cause: unknown): ErrorLike {
  return cause !== null && typeof cause === "object" ? (cause as ErrorLike) : {};
}

/** HTTP 429 with OpenAI's quota type or code, or the words it uses for it. */
export function isOutOfCredit(cause: unknown): boolean {
  const { message, status, code, type } = fields(cause);
  if (code === "credit_balance_exhausted" || type === "insufficient_quota") return true;
  const text = typeof message === "string" ? message : "";
  if (/insufficient_quota|credit_balance_exhausted|no credits remaining/i.test(text)) return true;
  return status === 429 && /quota|credit|billing/i.test(text);
}

/** HTTP 401, or the words the SDK uses for a key it will not accept. */
export function isKeyRejected(cause: unknown): boolean {
  const { message, status } = fields(cause);
  if (status === 401) return true;
  const text = typeof message === "string" ? message : "";
  return /api key|401|invalid/i.test(text);
}

/**
 * The message for the screen: out of credit, then a rejected key, then the
 * caller's own "could not be reached" line, which names what is safe.
 */
export function describeAiFailure(cause: unknown, unreachable: string): string {
  if (isOutOfCredit(cause)) return AI_OUT_OF_CREDIT;
  if (isKeyRejected(cause)) return AI_KEY_REJECTED;
  return unreachable;
}
