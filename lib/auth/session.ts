import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { CompanyRole } from "@/types/database";

export type SessionContext = {
  user: User;
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
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [membershipResult, profileResult] = await Promise.all([
    supabase
      .from("company_members")
      .select("role, company_id, companies(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
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
    user,
    userId: user.id,
    email: user.email ?? null,
    fullName: profileResult.data?.full_name ?? null,
    companyId: membership.company_id,
    companyName: company?.name ?? "Your company",
    role: membership.role,
  };
}

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
