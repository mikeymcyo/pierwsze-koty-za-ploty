"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { cleanedSectionsFor } from "@/lib/ai/cleanup";
import { documentMedia, photoMedia } from "@/lib/ai/cleanup-context";
import { generateSummarySections } from "@/lib/ai/summary-generation";
import {
  JOB_BRIEF_LABEL,
  JOB_DOCUMENT_LABEL,
  documentContextBlock,
  jobContextBlock,
} from "@/lib/ai/job-context";
import { generateInstructedWorks } from "@/lib/ai/instructed-works";
import { documentContextForProject } from "@/lib/documents/job-context";
import { photoManifest, photoReference, stripUnknownPlates } from "@/lib/pdf/photo-evidence";
import { photoPrintLabel } from "@/lib/photo-captions";
import { serialiseInstructedWorks } from "@/lib/summary-reports/instructed-works";
import { briefForPrompt } from "@/lib/projects/job-brief";
import { requireSessionContext } from "@/lib/auth/session";
import { partitionDraft } from "@/lib/reports/regeneration";
import { SUMMARY_REPORT_IS_FINAL } from "@/lib/summary-reports/finalisation";
import {
  buildEvidence,
  noEvidenceMessage,
  type DailyEvidence,
  type ProgressEvidence,
} from "@/lib/summary-reports/evidence";
import { isStandalone } from "@/lib/summary-reports/provenance";
import { SUMMARY_SECTION_LABELS, summarySortOrder } from "@/lib/summary-reports/sections";
import { REPORT_SECTION_LABELS } from "@/lib/report-sections";
import { reportStructure } from "@/lib/report-structure";
import { changedSections, readGroupFields } from "@/lib/reports/group-text";
import { createClient } from "@/lib/supabase/server";
import type { SummarySectionType } from "@/types/database";

export type SummaryAiState = {
  error?: string;
  generated?: number;
  kept?: number;
  saved?: boolean;
  /**
   * What the evidence actually amounted to, so the screen can say so. A
   * consolidation that silently read nothing is the one failure a user cannot
   * diagnose from the outside - see lib/summary-reports/evidence.ts.
   */
  fromDaily?: number;
  fromProgress?: number;
};

export async function generateSummaryReport(
  reportId: string,
  _previous: SummaryAiState,
  _formData: FormData,
): Promise<SummaryAiState> {
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("summary_reports")
    .select(
      "id, kind, status, period_start, period_end, project_id, projects(name, client, site_address, description)",
    )
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

  /**
   * A Daily Report covered by a Progress Report this document is also
   * consolidating is provenance, not evidence: its words already reached the
   * reader through that report's reviewed wording, and feeding both would
   * consolidate the same period twice. `via_summary_report_id` is what records
   * that, and this is where it is honoured.
   */
  const directDailyIds = (sources ?? [])
    .filter((source) => source.report_id && !source.via_summary_report_id)
    .map((source) => source.report_id as string);
  const progressIds = (sources ?? [])
    .filter((source) => source.source_summary_report_id)
    .map((source) => source.source_summary_report_id as string);

  const progressEvidence: ProgressEvidence[] = [];
  if (progressIds.length > 0) {
    const [progressResult, progressSectionsResult] = await Promise.all([
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
    // Read errors were swallowed here. A failure meant a whole source report
    // vanished from the evidence and the user was told the reports had nothing
    // in them - which sends somebody looking in exactly the wrong place.
    const readError = progressResult.error ?? progressSectionsResult.error;
    if (readError) {
      return { error: `Could not read the source Progress Reports: ${readError.message}` };
    }
    for (const source of progressResult.data ?? []) {
      progressEvidence.push({
        number: source.number,
        title: source.title,
        periodStart: source.period_start,
        periodEnd: source.period_end,
        sections: (progressSectionsResult.data ?? [])
          .filter((section) => section.summary_report_id === source.id)
          .map((section) => ({
            label:
              SUMMARY_SECTION_LABELS[section.section_type as SummarySectionType] ??
              section.section_type,
            content: section.content,
          })),
      });
    }
  }

  const dailyEvidence: DailyEvidence[] = [];
  if (directDailyIds.length > 0) {
    const [dailyResult, dailySectionsResult, workforceResult, plantResult] = await Promise.all([
      supabase
        .from("reports")
        .select("id, report_number, report_date, raw_notes")
        .in("id", directDailyIds)
        .order("report_date", { ascending: true })
        .order("report_number", { ascending: true }),
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
    const readError =
      dailyResult.error ??
      dailySectionsResult.error ??
      workforceResult.error ??
      plantResult.error;
    if (readError) {
      return { error: `Could not read the source Daily Reports: ${readError.message}` };
    }
    for (const source of dailyResult.data ?? []) {
      dailyEvidence.push({
        number: source.report_number,
        date: source.report_date,
        // Labelled as a reader knows them - "Works completed", not
        // "works_completed" - so the consolidator is reading a report rather
        // than a database dump.
        sections: (dailySectionsResult.data ?? [])
          .filter((section) => section.report_id === source.id)
          .map((section) => ({
            label:
              REPORT_SECTION_LABELS[section.section_type as keyof typeof REPORT_SECTION_LABELS] ??
              section.section_type,
            content: section.content,
          })),
        rawNotes: source.raw_notes,
        workforce: (workforceResult.data ?? [])
          .filter((row) => row.report_id === source.id)
          .map(
            (row) =>
              `${row.company_name}${row.trade ? ` (${row.trade})` : ""}: ${row.operatives} operative(s)`,
          ),
        plant: (plantResult.data ?? [])
          .filter((row) => row.report_id === source.id)
          .map((row) => `${row.description} x${row.quantity}`),
      });
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
  // The photographs in the order they will print, so a plate number the model
  // writes resolves to the plate the reader is looking at. photoManifest and
  // the PDF both number them with photoReference, from this same array.
  const orderedPhotoLabels = (selectedPhotos ?? []).flatMap((selected) => {
    const photo = photoById.get(selected.photo_id);
    if (!photo) return [];
    return [
      photoPrintLabel({
        caption: selected.caption_override?.trim() || photo.caption,
        category: photo.category,
      }),
    ];
  });
  const plateCount = orderedPhotoLabels.length;
  const photoManifestBlock = plateCount > 0 ? photoManifest(orderedPhotoLabels) : null;
  const photoCaptions = orderedPhotoLabels.map((label, index) => {
    const reference = photoReference(index);
    const stage = label.status ? `${label.status.toUpperCase()} · ` : "";
    return `${reference} | ${stage}${label.caption ?? "no caption"}`;
  });

  // A report with no source reports is written rather than consolidated - a
  // survey from a visit, or a Progress Report for a period the site manager
  // spent off site, put together from what operatives sent them. What it does
  // have is what they typed here, so that is the evidence, together with the
  // photographs and issues they recorded. Anything written by hand is
  // protected from being overwritten further down, so this reads those notes
  // without replacing them.
  const standalone = isStandalone((sources ?? []).length);
  let own: { label: string; content: string | null }[] | undefined;
  if (standalone) {
    const { data: rows, error: ownError } = await supabase
      .from("summary_report_sections")
      .select("section_type, content, sort_order")
      .eq("summary_report_id", reportId)
      .order("sort_order", { ascending: true });
    if (ownError) return { error: `Could not read your notes: ${ownError.message}` };
    own = (rows ?? []).map((row) => ({
      label: SUMMARY_SECTION_LABELS[row.section_type as SummarySectionType] ?? row.section_type,
      content: row.content,
    }));
  }

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
  const projectName = project?.name ?? "Project";
  // The same job brief the Daily Reports were read against, so a consolidated
  // document reads the period the same way. Scope, never evidence.
  const jobBrief = briefForPrompt(project?.description);
  // The same documents the Daily Reports were read against, so a consolidated
  // document reads the paperwork the same way it read the days.
  const jobDocuments = await documentContextForProject(supabase, report.project_id);
  const documentBlock = documentContextBlock(jobDocuments);

  const built = buildEvidence({
    progress: progressEvidence,
    daily: dailyEvidence,
    own,
    ownHeading:
      report.kind === "survey"
        ? "SURVEY NOTES RECORDED ON SITE"
        : "SITE INFORMATION RECORDED FOR THIS PERIOD",
    photoCaptions: photoCaptions,
  });
  const evidence = built.text;

  // Said before a model is called, and said in terms somebody can act on. A
  // consolidation of two issued reports that carry no words is a fact about
  // those reports, not a judgement on the evidence - and it used to arrive as
  // "the evidence did not support any report sections", which sends somebody
  // looking in the wrong place entirely.
  if (built.characters === 0) {
    return { error: noEvidenceMessage(built, (sources ?? []).length) };
  }

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
          ...(jobBrief ? [{ label: JOB_BRIEF_LABEL, text: jobBrief }] : []),
          ...(documentBlock ? [{ label: JOB_DOCUMENT_LABEL, text: documentBlock }] : []),
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
    jobBrief: jobContextBlock(jobBrief, jobDocuments),
  });
  if (!result.ok) return { error: result.error };

  // The instructed works table: its own pass, because a single response that
  // must be both a careful table and four paragraphs of prose degrades both.
  // Completion Reports only, and only where the job's paperwork actually
  // instructs something - with no instruction there is no table to fill, and
  // an empty one would be a heading over nothing.
  const instructedItems = jobDocuments.flatMap((document) =>
    document.scopeItems
      .filter((item) => item.commitment === "instructed")
      .map((item) => `- ${item.text}${document.title ? ` [${document.title}]` : ""}`),
  );
  const sections: Partial<Record<SummarySectionType, string>> = { ...result.sections };

  if (report.kind === "completion" && instructedItems.length > 0) {
    const table = await generateInstructedWorks(
      {
        projectName,
        client: project?.client ?? null,
        instruction: instructedItems.join("\n"),
        evidence,
        photographs: photoManifestBlock,
      },
      plateCount,
    );
    // A table that could not be written must not cost the client the rest of
    // the report: the prose is already drafted and is the larger part of it.
    if (table.ok && table.rows.length > 0) {
      sections.instructed_works = serialiseInstructedWorks(table.rows);
    } else if (!table.ok) {
      console.error("[siteboss] instructed works table skipped:", table.error);
    }
  }

  // A plate reference that points at no photograph is a claim that evidence
  // exists when it does not. The model is told to cite only real plates; this
  // is what makes it true of what gets stored.
  for (const [type, content] of Object.entries(sections) as [SummarySectionType, string][]) {
    if (type === "instructed_works") continue;
    sections[type] = stripUnknownPlates(content, plateCount);
  }

  const { data: edited, error: editedError } = await supabase
    .from("summary_report_sections")
    .select("section_type, content")
    .eq("summary_report_id", reportId)
    .eq("ai_generated", false);
  if (editedError) return { error: `Could not protect your edits: ${editedError.message}` };

  const drafted = Object.keys(sections) as SummarySectionType[];
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
        content: sections[type] as string,
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
  return {
    generated: write.length,
    kept: kept.length,
    fromDaily: built.dailyCount,
    fromProgress: built.progressCount,
  };
}

const groupSchema = z.object({ groupKey: z.string().min(1) });

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
  const parsedInput = groupSchema.safeParse({ groupKey: formData.get("groupKey") ?? "" });
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

  const submitted = readGroupFields((name) => formData.get(name)?.toString(), sections);
  const changed = changedSections(sections, submitted);
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
