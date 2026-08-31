import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Copies workforce and plant from the project's most recent other report.
 *
 * On most sites the same subcontractors and machines are there day after day,
 * and retyping them on a phone is the single most tedious part of the job. They
 * are a starting point, not a commitment - every copied row can be edited or
 * removed.
 *
 * Best effort on purpose: a failure here costs the user some retyping, which is
 * not a reason to fail creating the report they asked for.
 *
 * Lives here rather than in the actions file so both ways of starting a Daily
 * Report - the explicit "start a report" and Site Capture opening today's - use
 * the same carry-over without either importing the other's module.
 */
export async function copyPreviousEntries(
  supabase: Client,
  projectId: string,
  reportId: string,
  companyId: string,
) {
  const { data: previous } = await supabase
    .from("reports")
    .select("id")
    .eq("project_id", projectId)
    .neq("id", reportId)
    .order("report_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!previous) return;

  const [{ data: workforce }, { data: plant }] = await Promise.all([
    supabase
      .from("workforce_entries")
      .select("company_name, trade, operatives, sort_order")
      .eq("report_id", previous.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("plant_entries")
      .select("description, quantity, sort_order")
      .eq("report_id", previous.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (workforce?.length) {
    await supabase
      .from("workforce_entries")
      .insert(workforce.map((row) => ({ ...row, report_id: reportId, company_id: companyId })));
  }

  if (plant?.length) {
    await supabase
      .from("plant_entries")
      .insert(plant.map((row) => ({ ...row, report_id: reportId, company_id: companyId })));
  }
}
