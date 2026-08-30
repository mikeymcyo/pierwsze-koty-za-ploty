"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { cleanedSectionsFor } from "@/lib/ai/cleanup";
import { documentMedia, photoMedia } from "@/lib/ai/cleanup-context";
import { generateSummarySections } from "@/lib/ai/summary-generation";
import { requireSessionContext } from "@/lib/auth/session";
import { partitionDraft } from "@/lib/reports/regeneration";
import { SUMMARY_REPORT_IS_FINAL } from "@/lib/summary-reports/finalisation";
import { isStandalone } from "@/lib/summary-reports/provenance";
import { SUMMARY_SECTION_LABELS, summarySortOrder } from "@/lib/summary-reports/sections";
import { reportStructure } from "@/lib/report-structure";
import { changedSections, parseGroupText } from "@/lib/reports/group-text";
import { createClient } from "@/lib/supabase/server";
import type { SummarySectionType } from "@/types/database";

export type SummaryAiState = { error?: string; generated?: number; kept?: number; saved?: boolean };

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

  // A report with no source reports is written rather than consolidated - a
  // survey from a visit, or a Progress Report for a period the site manager
  // spent off site, put together from what operatives sent them. What it does
  // have is what they typed here, so that is the evidence, together with the
  // photographs and issues they recorded. Anything written by hand is
  // protected from being overwritten further down, so this reads those notes
  // without replacing them.
  const standalone = isStandalone((sources ?? []).length);
  if (standalone) {
    const { data: own } = await supabase
      .from("summary_report_sections")
      .select("section_type, content, sort_order")
      .eq("summary_report_id", reportId)
      .order("sort_order", { ascending: true });
    const written = sectionText(own ?? []);
    if (written) {
      evidenceBlocks.push(
        report.kind === "survey"
          ? `SURVEY NOTES RECORDED ON SITE\n${written}`
          : `SITE INFORMATION RECORDED FOR THIS PERIOD\n${written}`,
      );
    }
  }

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
  const projectName = project?.name ?? "Project";
  const evidence = [
    evidenceBlocks.join("\n\n"),
    photoEvidence ? `CURATED PHOTOGRAPH CAPTIONS:\n${photoEvidence}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Pass one, the Cleanup AI, over the same evidence the drafting pass reads.
  // A survey's material is a visit rather than a period, and its sections ask
  // what was found and what is proposed - which is why the kind is passed
  // through rather than assumed.
  // Skipped outright when there is no evidence: the drafting pass refuses an
  // empty draft below, so there is nothing to clean and no reason to read the
  // documents or call a model to find that out.
  const cleanedSections = evidence.trim()
    ? await cleanedSectionsFor({
        kind: report.kind,
        projectName,
        client: project?.client ?? null,
        siteAddress: project?.site_address ?? null,
        dateLine:
          report.period_start && report.period_end
            ? `${report.kind === "survey" ? "VISIT" : "REPORTING PERIOD"}: ${report.period_start} to ${report.period_end}`
            : "REPORTING PERIOD: whole project record",
        weather: null,
        authorName: null,
        context: [
          {
            label: "ISSUE RECORD",
            text: issueEvidence || "No issue rows were selected. Do not claim that no issues occurred.",
          },
        ],
        media: [
          ...photoMedia(
            (selectedPhotos ?? []).flatMap((selected) => {
              const photo = photoById.get(selected.photo_id);
              return photo
                ? [
                    {
                      category: photo.category,
                      caption: selected.caption_override?.trim() || photo.caption,
                    },
                  ]
                : [];
            }),
          ),
          ...(await documentMedia(supabase, {
            table: "summary_report_documents",
            column: "summary_report_id",
            id: reportId,
          })),
        ],
        source: evidence,
      })
    : [];

  // Pass two, the drafting pass, reading the evidence itself.
  const result = await generateSummarySections({
    kind: report.kind,
    projectName,
    client: project?.client ?? null,
    siteAddress: project?.site_address ?? null,
    periodStart: report.period_start,
    periodEnd: report.period_end,
    evidence,
    issues: issueEvidence,
    standalone,
    cleanedSections,
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

const groupSchema = z.object({ groupKey: z.string().min(1), text: z.string() });

/**
 * Saves one visible section of a consolidated document - which is several
 * stored sections. The daily report's twin; see the note on updateSectionGroup
 * in app/(app)/reports/ai-actions.ts for why one box holds several sections
 * and how the protection rule survives it.
 */
export async function updateSummarySectionGroup(
  reportId: string,
  _previous: SummaryAiState,
  formData: FormData,
): Promise<SummaryAiState> {
  const parsedInput = groupSchema.safeParse({
    groupKey: formData.get("groupKey") ?? "",
    text: formData.get("text") ?? "",
  });
  if (!parsedInput.success) return { error: "That edit could not be saved." };

  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("summary_reports")
    .select("kind, status")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "That report could not be found." };
  if (report.status === "final") return { error: SUMMARY_REPORT_IS_FINAL };

  const group = reportStructure(report.kind).find(
    (candidate) => candidate.key === parsedInput.data.groupKey,
  );
  if (!group) return { error: "That part of the report could not be found." };

  const { data: rows, error: readError } = await supabase
    .from("summary_report_sections")
    .select("section_type, content")
    .eq("summary_report_id", reportId);
  if (readError) return { error: `Could not read the report: ${readError.message}` };

  const byType = new Map((rows ?? []).map((row) => [row.section_type, row.content]));
  const sections = group.sections.map((type) => ({
    type,
    label: SUMMARY_SECTION_LABELS[type as SummarySectionType] ?? type,
    content: byType.get(type as SummarySectionType) ?? "",
  }));

  const parsed = parseGroupText(parsedInput.data.text, sections);
  const changed = changedSections(sections, parsed);
  if (changed.length === 0) return { saved: true };

  const { error } = await supabase.from("summary_report_sections").upsert(
    changed.map((section) => ({
      company_id: session.companyId,
      summary_report_id: reportId,
      section_type: section.type as SummarySectionType,
      content: section.content.trim() || null,
      ai_generated: false,
      sort_order: summarySortOrder(report.kind, section.type as SummarySectionType),
    })),
    { onConflict: "summary_report_id,section_type" },
  );
  if (error) return { error: `Could not save your edit: ${error.message}` };

  revalidatePath(`/summary-reports/${reportId}`);
  return { saved: true };
}
