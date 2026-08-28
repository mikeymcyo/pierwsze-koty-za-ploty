/**
 * Which build is this.
 *
 * There was no way to tell from the app which commit a deployment was running,
 * so a stale Preview and a fresh one looked identical on a phone - and a
 * prompt change that had not actually shipped looked like a prompt change that
 * had not worked. A short SHA on the profile screen answers it in two seconds.
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA on every deployment. It is not a secret:
 * it names a commit in a public repository and grants nothing. Nothing else
 * from the environment is exposed here, and no other variable should be added
 * to this file.
 *
 * No runtime imports and no path aliases, so it loads straight into Node for
 * e2e/build-ref-smoke.mjs.
 */

/** Long enough to be unambiguous in this repository, short enough to read on a phone. */
export const BUILD_REF_LENGTH = 7;

/**
 * The short commit SHA for this build, or null when there is not one.
 *
 * Null is the normal answer off Vercel - `next dev`, a local `next start`, a
 * test run - and the profile screen renders nothing rather than inventing a
 * placeholder. Anything that is not a hex SHA is treated as absent: an
 * environment variable is not worth rendering unverified.
 */
export function shortBuildRef(env: { VERCEL_GIT_COMMIT_SHA?: string }): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  return sha.slice(0, BUILD_REF_LENGTH).toLowerCase();
}
