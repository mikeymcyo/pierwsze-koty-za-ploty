/**
 * Environment access.
 *
 * Values are read through getters so that a missing variable fails at request
 * time with an actionable message, rather than crashing the production build.
 * NEXT_PUBLIC_* names are referenced statically so Next.js can inline them.
 */

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
  get siteUrl() {
    // Used to build absolute callback URLs for password reset and email links.
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = process.env.VERCEL_URL?.trim();
    if (vercel) return `https://${vercel}`;
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
