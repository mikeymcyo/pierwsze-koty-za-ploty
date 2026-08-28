"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { generateSections, type GenerationInput } from "@/lib/ai/report-generation";
import { sortOrderOf } from "@/lib/report-sections";
import { partitionDraft } from "@/lib/reports/regeneration";
import type { ReportSectionType } from "@/types/database";

export type AiState = { error?: string; generated?: number; kept?: number };

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
 * entirely stale.
 *
 * Nothing here touches a section a person has written. `ai_generated` is false
 * on anything edited through updateSection, and those sections are neither
 * overwritten nor cleared: a site manager who rewrote a paragraph in his own
 * words, in a document that goes to a client with his name on it, must not
 * lose it to a button press. How many were kept comes back in the result so
 * the screen can say so rather than leaving him to notice.
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

  // Read before writing: these are the sections somebody has rewritten, and
  // they are off limits to both the upsert and the clear-out below.
  const { data: edited, error: editedError } = await supabase
    .from("report_sections")
    .select("section_type")
    .eq("report_id", reportId)
    .eq("ai_generated", false);

  if (editedError) {
    // Without this list there is no way to tell a person's paragraph from the
    // model's, and overwriting one would be worse than not regenerating at all.
    return { error: `Could not save the draft: ${editedError.message}` };
  }

  // Everything the new draft supports, whether or not it is ours to write. The
  // clear-out below is measured against this rather than against what was
  // written, so a section held back by an edit is not then deleted for being
  // absent from it.
  const drafted = Object.keys(result.sections) as ReportSectionType[];
  const { write, kept } = partitionDraft(
    drafted,
    (edited ?? []).map((row) => row.section_type),
  );

  const rows = write.map((type) => ({
    company_id: session.companyId,
    report_id: reportId,
    section_type: type,
    content: result.sections[type] as string,
    ai_generated: true,
    sort_order: sortOrderOf(type),
  }));

  // report_sections is unique on (report_id, section_type), so regenerating
  // replaces a section rather than accumulating duplicates.
  if (rows.length > 0) {
    const { error: writeError } = await supabase
      .from("report_sections")
      .upsert(rows, { onConflict: "report_id,section_type" });

    if (writeError) return { error: `Could not save the draft: ${writeError.message}` };
  }

  // Deliberately after the upsert, and excluding everything it just wrote: if
  // this delete runs first and the upsert then fails, the report is left empty.
  // In this order the worst case is a stale section surviving one more run.
  //
  // Scoped to this report and this company as well as to ai_generated - RLS
  // already confines it to the caller's company, and the report_id filter to
  // one report, but a delete deserves belt and braces.
  // generateSections refuses to return an empty draft, so `drafted` always has
  // at least one entry - but an empty "not in ()" is a syntax error rather than
  // a no-op, so it is worth not depending on that from here. ai_generated is
  // what spares an edited section from this.
  const clear = supabase
    .from("report_sections")
    .delete()
    .eq("report_id", reportId)
    .eq("company_id", session.companyId)
    .eq("ai_generated", true);

  const { error: clearError } = drafted.length
    ? await clear.not("section_type", "in", `(${drafted.join(",")})`)
    : await clear;

  // A failure here leaves a stale section, not a broken report. The draft the
  // user asked for is already saved, so telling them it failed would be worse
  // than the symptom.
  if (clearError) {
    console.error("[siteboss] could not clear stale sections:", clearError.message);
  }

  revalidatePath(`/reports/${reportId}`);
  return { generated: rows.length, kept: kept.length };
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
