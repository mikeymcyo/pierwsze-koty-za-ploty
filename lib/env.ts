/**
 * Environment access.
 *
 * Values are read through getters so that a missing variable fails at request
 * time with an actionable message, rather than crashing the production build.
 * NEXT_PUBLIC_* names are referenced statically so Next.js can inline them.
 */

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in — see README.md.`,
    );
  }
  return trimmed;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  /**
   * Origin used to build the absolute callback links in confirmation and
   * password reset emails. Every value here must be allow-listed in Supabase
   * under Authentication -> URL Configuration -> Redirect URLs.
   *
   * On Vercel the per-deployment VERCEL_URL is deliberately the last resort: it
   * changes with every push, so relying on it would mean re-allow-listing a new
   * URL each time. VERCEL_BRANCH_URL is stable for the life of a branch, which
   * makes preview deployments a one-time setup.
   */
  get siteUrl() {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (explicit) return stripTrailingSlash(explicit);

    if (process.env.VERCEL_ENV === "production") {
      const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
      if (production) return `https://${stripTrailingSlash(production)}`;
    }

    const branch = process.env.VERCEL_BRANCH_URL?.trim();
    if (branch) return `https://${stripTrailingSlash(branch)}`;

    const deployment = process.env.VERCEL_URL?.trim();
    if (deployment) return `https://${stripTrailingSlash(deployment)}`;

    return "http://localhost:3000";
  },
};

/** True when Supabase credentials are present, so the UI can guide setup. */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}
