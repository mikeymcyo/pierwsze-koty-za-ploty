import type { Instrumentation } from "next";

/**
 * Pairs every server error with the digest the browser shows the user.
 *
 * In production React withholds the real message and hands the browser only a
 * digest - "Minified React error #441" plus a reference number. Without this
 * hook the matching server log line is Next's own default, which is easy to
 * miss among the rest of the traffic in Vercel's Runtime Logs.
 *
 * So every error is written as one line, prefixed and tagged, and the digest is
 * repeated in it. Finding the cause of a reported reference number becomes a
 * search for that number rather than a hunt through logs by timestamp.
 *
 * This is server-side only. Nothing here reaches the browser, so the message
 * text stays where it belongs.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  // React may re-wrap what was thrown, so the digest is the only reliable
  // link back to what the user actually saw.
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : "none";

  const message = error instanceof Error ? error.message : String(error);

  console.error(
    `[siteboss] server error digest=${digest} route=${context.routePath} type=${context.routeType} path=${request.path} method=${request.method} message=${JSON.stringify(message)}`,
  );

  // The stack goes on its own line so the searchable summary above stays on one.
  if (error instanceof Error && error.stack) {
    console.error(`[siteboss] digest=${digest} stack:\n${error.stack}`);
  }
};
