"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { generateSections, type GenerationInput } from "@/lib/ai/report-generation";
import { sortOrderOf } from "@/lib/report-sections";
import type { ReportSectionType } from "@/types/database";

export type AiState = { error?: string; generated?: number };

/**
 * Drafts the report sections from the notes already saved on the report.
 *
 * Deliberately reads from the database rather than the form: generation must
 * describe what is actually recorded, so an unsaved edit sitting in a textarea
 * should not appear in the write-up. The user saves, then generates.
 *
 * Existing sections are overwritten - regenerating is the point of the button -
 * but reports.raw_notes is never touched, so the user's own words survive every
 * regeneration and stay visible next to the result.
 */
export async function generateReport(
  reportId: string,
  _prev: AiState,
  _formData: FormData,
): Promise<AiState> {
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("reports")
    .select(
      "id, report_date, weather, raw_notes, author_name, project_id, projects(name, client, site_address)",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (error) return { error: `Could not read the report: ${error.message}` };
  if (!report) return { error: "That report could not be found." };

  const [{ data: workforce }, { data: plant }, { data: photos }] = await Promise.all([
    supabase
      .from("workforce_entries")
      .select("company_name, trade, operatives")
      .eq("report_id", reportId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("plant_entries")
      .select("description, quantity")
      .eq("report_id", reportId)
      .order("sort_order", { ascending: true }),
    supabase.from("photos").select("category, caption").eq("report_id", reportId),
  ]);

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;

  const input: GenerationInput = {
    projectName: project?.name ?? "Unnamed project",
    client: project?.client ?? null,
    siteAddress: project?.site_address ?? null,
    reportDate: report.report_date,
    weather: report.weather,
    authorName: report.author_name,
    workforce: workforce ?? [],
    plant: plant ?? [],
    photos: photos ?? [],
    rawNotes: report.raw_notes ?? "",
  };

  const result = await generateSections(input);
  if (!result.ok) return { error: result.error };

  const rows = Object.entries(result.sections).map(([type, content]) => ({
    company_id: session.companyId,
    report_id: reportId,
    section_type: type as ReportSectionType,
    content,
    ai_generated: true,
    sort_order: sortOrderOf(type as ReportSectionType),
  }));

  // report_sections is unique on (report_id, section_type), so regenerating
  // replaces a section rather than accumulating duplicates.
  const { error: writeError } = await supabase
    .from("report_sections")
    .upsert(rows, { onConflict: "report_id,section_type" });

  if (writeError) return { error: `Could not save the draft: ${writeError.message}` };

  revalidatePath(`/reports/${reportId}`);
  return { generated: rows.length };
}

const editSchema = z.object({
  sectionId: z.uuid(),
  content: z.string().trim(),
});

/**
 * Saves a user's edit to a generated section.
 *
 * ai_generated flips to false: once a person has rewritten a paragraph it is
 * theirs, and the UI should stop labelling it as machine-written.
 */
export async function updateSection(
  reportId: string,
  _prev: AiState,
  formData: FormData,
): Promise<AiState> {
  const parsed = editSchema.safeParse({
    sectionId: formData.get("sectionId") ?? "",
    content: formData.get("content") ?? "",
  });
  if (!parsed.success) return { error: "That edit could not be saved." };

  await requireSessionContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("report_sections")
    .update({ content: parsed.data.content, ai_generated: false })
    .eq("id", parsed.data.sectionId);

  if (error) return { error: `Could not save your edit: ${error.message}` };

  revalidatePath(`/reports/${reportId}`);
  return {};
}
