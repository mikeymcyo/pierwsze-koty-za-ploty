"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { generateSummarySections } from "@/lib/ai/summary-generation";
import { requireSessionContext } from "@/lib/auth/session";
import { partitionDraft } from "@/lib/reports/regeneration";
import { SUMMARY_REPORT_IS_FINAL } from "@/lib/summary-reports/finalisation";
import { summarySortOrder } from "@/lib/summary-reports/sections";
import { createClient } from "@/lib/supabase/server";
import type { SummarySectionType } from "@/types/database";

export type SummaryAiState = { error?: string; generated?: number; kept?: number };

function sectionText(rows: { section_type: string; content: string | null }[]): string {
  return rows
    .filter((row) => row.content?.trim())
    .map((row) => `${row.section_type.replaceAll("_", " ")}: ${row.content?.trim()}`)
    .join("\n");
}

export async function generateSummaryReport(
  reportId: string,
  _previous: SummaryAiState,
  _formData: FormData,
): Promise<SummaryAiState> {
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("summary_reports")
    .select("id, kind, status, period_start, period_end, projects(name, client, site_address)")
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { error: `Could not read the report: ${error.message}` };
  if (!report) return { error: "That report could not be found." };
  if (report.status === "final") return { error: SUMMARY_REPORT_IS_FINAL };

  const { data: sources, error: sourcesError } = await supabase
    .from("summary_report_sources")
    .select("report_id, source_summary_report_id, via_summary_report_id, sort_order")
    .eq("summary_report_id", reportId)
    .order("sort_order", { ascending: true });
  if (sourcesError) return { error: `Could not read the source reports: ${sourcesError.message}` };

  const directDailyIds = (sources ?? [])
    .filter((source) => source.report_id && !source.via_summary_report_id)
    .map((source) => source.report_id as string);
  const progressIds = (sources ?? [])
    .filter((source) => source.source_summary_report_id)
    .map((source) => source.source_summary_report_id as string);

  const evidenceBlocks: string[] = [];
  if (progressIds.length > 0) {
    const [{ data: progress }, { data: progressSections }] = await Promise.all([
      supabase
        .from("summary_reports")
        .select("id, number, title, period_start, period_end")
        .in("id", progressIds)
        .order("number", { ascending: true }),
      supabase
        .from("summary_report_sections")
        .select("summary_report_id, section_type, content, sort_order")
        .in("summary_report_id", progressIds)
        .order("sort_order", { ascending: true }),
    ]);
    for (const source of progress ?? []) {
      const content = sectionText(
        (progressSections ?? []).filter((section) => section.summary_report_id === source.id),
      );
      evidenceBlocks.push(
        [
          `ISSUED PROGRESS REPORT ${String(source.number).padStart(3, "0")}`,
          source.title ? `Title: ${source.title}` : null,
          source.period_start && source.period_end
            ? `Period: ${source.period_start} to ${source.period_end}`
            : null,
          content,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  if (directDailyIds.length > 0) {
    const [
      { data: daily },
      { data: dailySections },
      { data: workforce },
      { data: plant },
    ] = await Promise.all([
      supabase
        .from("reports")
        .select("id, report_number, report_date, raw_notes")
        .in("id", directDailyIds)
        .order("report_date", { ascending: true }),
      supabase
        .from("report_sections")
        .select("report_id, section_type, content, sort_order")
        .in("report_id", directDailyIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("workforce_entries")
        .select("report_id, company_name, trade, operatives, sort_order")
        .in("report_id", directDailyIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("plant_entries")
        .select("report_id, description, quantity, sort_order")
        .in("report_id", directDailyIds)
        .order("sort_order", { ascending: true }),
    ]);
    for (const source of daily ?? []) {
      const written = sectionText(
        (dailySections ?? []).filter((section) => section.report_id === source.id),
      );
      const dailyWorkforce = (workforce ?? [])
        .filter((row) => row.report_id === source.id)
        .map(
          (row) =>
            `${row.company_name}${row.trade ? ` (${row.trade})` : ""}: ${row.operatives} operative(s)`,
        )
        .join("; ");
      const dailyPlant = (plant ?? [])
        .filter((row) => row.report_id === source.id)
        .map((row) => `${row.description} x${row.quantity}`)
        .join("; ");
      evidenceBlocks.push(
        [
          `FINAL DAILY REPORT ${String(source.report_number).padStart(3, "0")} - ${source.report_date}`,
          written || (source.raw_notes ? `Source notes: ${source.raw_notes}` : ""),
          dailyWorkforce ? `Recorded workforce: ${dailyWorkforce}` : null,
          dailyPlant ? `Recorded plant: ${dailyPlant}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  const { data: selectedIssueRows } = await supabase
    .from("summary_report_issues")
    .select("issue_id")
    .eq("summary_report_id", reportId)
    .order("sort_order", { ascending: true });
  const issueIds = (selectedIssueRows ?? []).map((row) => row.issue_id);
  const { data: issues } = issueIds.length
    ? await supabase
        .from("issues")
        .select("id, title, description, status, resolution, responsible")
        .in("id", issueIds)
    : { data: [] };
  const { data: issueEvents } = issueIds.length
    ? await supabase
        .from("issue_events")
        .select("issue_id, from_status, to_status, note, created_at")
        .in("issue_id", issueIds)
        .order("created_at", { ascending: true })
    : { data: [] };
  const eventsByIssue = new Map<string, string[]>();
  for (const event of issueEvents ?? []) {
    const eventDate = event.created_at.slice(0, 10);
    if (report.period_start && eventDate < report.period_start) continue;
    if (report.period_end && eventDate > report.period_end) continue;
    const values = eventsByIssue.get(event.issue_id) ?? [];
    values.push(
      `${eventDate}: ${event.from_status ? `${event.from_status} to ` : "raised as "}${event.to_status}${
        event.note ? ` (${event.note})` : ""
      }`,
    );
    eventsByIssue.set(event.issue_id, values);
  }
  const issueEvidence = (issues ?? [])
    .map((issue) =>
      [
        issue.title,
        issue.description,
        `Status: ${issue.status}`,
        issue.responsible ? `Responsible: ${issue.responsible}` : null,
        issue.resolution ? `Recorded resolution: ${issue.resolution}` : null,
        ...(eventsByIssue.get(issue.id) ?? []),
      ]
        .filter(Boolean)
        .join(" · "),
    )
    .join("\n");

  const { data: selectedPhotos } = await supabase
    .from("summary_report_photos")
    .select("photo_id, caption_override")
    .eq("summary_report_id", reportId)
    .order("sort_order", { ascending: true });
  const selectedPhotoIds = (selectedPhotos ?? []).map((row) => row.photo_id);
  const { data: photos } = selectedPhotoIds.length
    ? await supabase
        .from("photos")
        .select("id, category, caption")
        .in("id", selectedPhotoIds)
    : { data: [] };
  const photoById = new Map((photos ?? []).map((photo) => [photo.id, photo]));
  const photoEvidence = (selectedPhotos ?? [])
    .flatMap((selected) => {
      const photo = photoById.get(selected.photo_id);
      return photo
        ? [`[${photo.category}] ${selected.caption_override?.trim() || photo.caption || "uncaptioned photograph"}`]
        : [];
    })
    .join("\n");

  // A survey has no source reports - it is written from a visit. What it does
  // have is what the surveyor typed on site, so that is the evidence, together
  // with the photographs and issues they recorded. Anything they wrote by hand
  // is protected from being overwritten further down, so this reads their
  // notes without replacing them.
  if (report.kind === "survey") {
    const { data: own } = await supabase
      .from("summary_report_sections")
      .select("section_type, content, sort_order")
      .eq("summary_report_id", reportId)
      .order("sort_order", { ascending: true });
    const written = sectionText(own ?? []);
    if (written) evidenceBlocks.push(`SURVEY NOTES RECORDED ON SITE\n${written}`);
  }

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
  const result = await generateSummarySections({
    kind: report.kind,
    projectName: project?.name ?? "Project",
    client: project?.client ?? null,
    siteAddress: project?.site_address ?? null,
    periodStart: report.period_start,
    periodEnd: report.period_end,
    evidence: [
      evidenceBlocks.join("\n\n"),
      photoEvidence ? `CURATED PHOTOGRAPH CAPTIONS:\n${photoEvidence}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    issues: issueEvidence,
  });
  if (!result.ok) return { error: result.error };

  const { data: edited, error: editedError } = await supabase
    .from("summary_report_sections")
    .select("section_type, content")
    .eq("summary_report_id", reportId)
    .eq("ai_generated", false);
  if (editedError) return { error: `Could not protect your edits: ${editedError.message}` };

  const drafted = Object.keys(result.sections) as SummarySectionType[];
  const userSections = (edited ?? [])
    .filter((section) => section.content?.trim())
    .map((section) => section.section_type);
  const { write, kept } = partitionDraft(drafted, userSections);
  if (write.length > 0) {
    const { error: writeError } = await supabase.from("summary_report_sections").upsert(
      write.map((type) => ({
        company_id: session.companyId,
        summary_report_id: reportId,
        section_type: type,
        content: result.sections[type] as string,
        ai_generated: true,
        sort_order: summarySortOrder(report.kind, type),
      })),
      { onConflict: "summary_report_id,section_type" },
    );
    if (writeError) return { error: `Could not save the draft: ${writeError.message}` };
  }

  const stale = supabase
    .from("summary_report_sections")
    .update({ content: null })
    .eq("summary_report_id", reportId)
    .eq("ai_generated", true);
  const { error: staleError } = drafted.length
    ? await stale.not("section_type", "in", `(${drafted.join(",")})`)
    : await stale;
  if (staleError) console.error("[siteboss] could not clear stale summary sections:", staleError.message);

  revalidatePath(`/summary-reports/${reportId}`);
  return { generated: write.length, kept: kept.length };
}

const editSchema = z.object({ sectionId: z.uuid(), content: z.string().trim() });

export async function updateSummarySection(
  reportId: string,
  _previous: SummaryAiState,
  formData: FormData,
): Promise<SummaryAiState> {
  const parsed = editSchema.safeParse({
    sectionId: formData.get("sectionId") ?? "",
    content: formData.get("content") ?? "",
  });
  if (!parsed.success) return { error: "That edit could not be saved." };
  await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("summary_reports")
    .select("status")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "That report could not be found." };
  if (report.status === "final") return { error: SUMMARY_REPORT_IS_FINAL };

  const { error } = await supabase
    .from("summary_report_sections")
    .update({ content: parsed.data.content || null, ai_generated: false })
    .eq("id", parsed.data.sectionId)
    .eq("summary_report_id", reportId);
  if (error) return { error: `Could not save your edit: ${error.message}` };
  revalidatePath(`/summary-reports/${reportId}`);
  return {};
}
