import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import type { CompanyRole } from "@/types/database";

export type SessionContext = {
  userId: string;
  email: string | null;
  fullName: string | null;
  companyId: string;
  companyName: string;
  role: CompanyRole;
};

/**
 * Resolves the signed-in user together with the company they belong to.
 *
 * Returns null when there is no session. Every new user is given a company by
 * the signup trigger, so a session without a membership means the trigger did
 * not run — that is surfaced as an error rather than silently ignored.
 *
 * Wrapped in React's `cache`, so one request resolves this once however many
 * layouts and pages ask. It used to run three times on every signed-in
 * screen - the app layout, the page, and the top bar's company name - and
 * each run was a round trip to the auth server plus two queries, against a
 * database in another continent. Measured on the dashboard that was about
 * half a second of the wait for the first byte. The cache lives for one
 * server render: a server action or a route handler still resolves its own.
 */
export const getSessionContext = cache(async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  // The token, verified locally against the project's cached signing keys
  // rather than by a round trip to the auth server (getUser). Measured on the
  // owner's phone: that trip sat in front of the two queries below at 30-90
  // ms on a quiet morning and 300 ms once the screen's link prefetches were
  // queueing behind it. The proxy has already refreshed an expired token by
  // the time a page renders, so this is a signature check and nothing more.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  if (!user || typeof user.sub !== "string" || !user.sub) return null;

  // This is the first query after signup or sign-in, so it is the one that hits
  // the GoTrue/PostgREST clock-skew race. See withClockSkewRetry.
  const [membershipResult, profileResult] = await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("company_members")
        .select("role, company_id, companies(name)")
        .eq("user_id", user.sub)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ),
    withClockSkewRetry(() =>
      supabase.from("profiles").select("full_name").eq("id", user.sub).maybeSingle(),
    ),
  ]);

  if (membershipResult.error) {
    throw new Error(`Could not load your company: ${membershipResult.error.message}`);
  }

  const membership = membershipResult.data;

  if (!membership) {
    throw new Error(
      "Your account is not linked to a company. The signup database trigger may not have been applied — run the migrations in supabase/migrations.",
    );
  }

  const company = Array.isArray(membership.companies)
    ? membership.companies[0]
    : membership.companies;

  return {
    userId: user.sub,
    email: typeof user.email === "string" ? user.email : null,
    fullName: profileResult.data?.full_name ?? null,
    companyId: membership.company_id,
    companyName: company?.name ?? "Your company",
    role: membership.role,
  };
});

/** Same as getSessionContext, but redirects to the login screen when signed out. */
export async function requireSessionContext(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  return context;
}

/** The name shown as the report author: profile name, then email, then a fallback. */
export function displayName(context: SessionContext): string {
  return context.fullName?.trim() || context.email?.split("@")[0] || "Site team";
}
