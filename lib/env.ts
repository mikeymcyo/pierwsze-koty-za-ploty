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

/**
 * The two readers below are the single source of truth for "is Supabase
 * configured", used by both `hasSupabaseConfig()` and the `env` getters.
 *
 * They must not drift apart. When they did, the guard trimmed and used `||`
 * while the getter used `??`, and the two disagreed about an **empty-string**
 * variable: `""` is falsy but not nullish. Setting
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to an empty value alongside a valid
 * NEXT_PUBLIC_SUPABASE_ANON_KEY therefore passed the guard and then threw in
 * the getter, which 500s every route - including the landing page that exists
 * to explain the misconfiguration. An empty variable is easy to create by
 * accident in the Vercel dashboard, so treat empty and absent as identical.
 *
 * NEXT_PUBLIC_* names stay statically referenced so Next.js can inline them.
 */
function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
}

function supabaseKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    undefined
  );
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl());
  },
  /**
   * The browser-facing API key. Supabase is migrating from the legacy JWT
   * `anon` key to the newer `sb_publishable_...` format, and hands out
   * different variable names depending on the project's age, so both are
   * accepted. Either is safe in a browser bundle — Row Level Security, not key
   * secrecy, is what protects the data.
   *
   * The `service_role` / `sb_secret_...` key must never be used here.
   */
  get supabaseKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
      supabaseKey(),
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
  return Boolean(supabaseUrl() && supabaseKey());
}
