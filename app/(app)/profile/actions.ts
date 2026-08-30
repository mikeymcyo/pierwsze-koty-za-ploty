"use server";

import { revalidatePath } from "next/cache";

import { requireSessionContext } from "@/lib/auth/session";
import {
  COMPANY_OWNER_ONLY,
  canEditCompanyDetails,
  companyNameProblem,
} from "@/lib/company/details";
import { createClient } from "@/lib/supabase/server";

export type CompanyDetailsState = {
  error?: string;
  saved?: boolean;
};

/**
 * Renames the company.
 *
 * Nothing else has to happen for this to reach a report: every renderer reads
 * the name from the session at the moment it draws, so the next preview and
 * the next issued PDF carry it. Nothing that has already been issued is
 * touched - those bytes are in storage and this never opens the bucket.
 *
 * Ownership is checked here and enforced again by the `companies_update_owners`
 * policy. The policy is the one that counts: a form the screen no longer
 * renders can still be posted. When it refuses, the update simply matches no
 * row, which is the same answer as a company that is not the caller's.
 */
export async function updateCompanyName(
  _prev: CompanyDetailsState,
  formData: FormData,
): Promise<CompanyDetailsState> {
  const session = await requireSessionContext();

  if (!canEditCompanyDetails(session.role)) return { error: COMPANY_OWNER_ONLY };

  const name = String(formData.get("name") ?? "").trim();
  const problem = companyNameProblem(name);
  if (problem) return { error: problem };

  if (name === session.companyName) return { saved: true };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ name })
    .eq("id", session.companyId)
    .select("id")
    .maybeSingle();

  if (error) return { error: `The company name could not be saved: ${error.message}` };
  if (!data) return { error: COMPANY_OWNER_ONLY };

  // The name is in the top bar, on the dashboard and in every draft preview,
  // so the whole shell is stale rather than one page.
  revalidatePath("/", "layout");
  return { saved: true };
}
