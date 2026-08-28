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
 *
 * A section the new draft leaves empty is not written, so it also has to be
 * cleared: otherwise the previous draft's paragraph stays on screen under a
 * heading the current notes no longer support, which is the same false claim
 * the prompt works to avoid - and it made a freshly regenerated report look
 * entirely stale. Only rows the AI wrote are removed. A section somebody has
 * edited carries ai_generated = false and is left alone.
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

  // Deliberately after the upsert, and excluding everything it just wrote: if
  // this delete runs first and the upsert then fails, the report is left empty.
  // In this order the worst case is a stale section surviving one more run.
  //
  // Scoped to this report and this company as well as to ai_generated - RLS
  // already confines it to the caller's company, and the report_id filter to
  // one report, but a delete deserves belt and braces.
  const written = rows.map((row) => row.section_type);

  // generateSections refuses to return an empty draft, so `written` always has
  // at least one entry - but an empty "not in ()" is a syntax error rather than
  // a no-op, so it is worth not depending on that from here.
  const clear = supabase
    .from("report_sections")
    .delete()
    .eq("report_id", reportId)
    .eq("company_id", session.companyId)
    .eq("ai_generated", true);

  const { error: clearError } = written.length
    ? await clear.not("section_type", "in", `(${written.join(",")})`)
    : await clear;

  // A failure here leaves a stale section, not a broken report. The draft the
  // user asked for is already saved, so telling them it failed would be worse
  // than the symptom.
  if (clearError) {
    console.error("[siteboss] could not clear stale sections:", clearError.message);
  }

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
