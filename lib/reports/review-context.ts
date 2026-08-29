import "server-only";

import type { MasterReviewInput, ReviewableSection } from "@/lib/ai/master-review-prompt";
import { resolveDocument } from "@/lib/documents/metadata";
import { loadReferencedDocuments } from "@/lib/documents/snapshot";
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS } from "@/lib/issues/metadata";
import { photoPrintLabelText } from "@/lib/photo-captions";
import { REPORT_SECTIONS } from "@/lib/report-sections";
import { reportNumberLabel } from "@/lib/pdf/report-data";
import { summarySectionsFor, SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";
import type { CurrentSection } from "@/lib/reports/master-review";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Everything the reviewer needs about one report, gathered once.
 *
 * Two rules shape what goes in.
 *
 * Photographs are represented by their status and caption, never their pixels.
 * A description somebody has already written and accepted is better evidence
 * of what a photograph shows than a fresh look would be, and re-reading twelve
 * images to tidy some prose is not worth the money. A photograph with nothing
 * written against it is listed as exactly that, so the reviewer can say a
 * caption is missing rather than guess at one.
 *
 * Supporting documents are represented by their metadata. Their contents are
 * not parsed: a drawing is evidence that a drawing was issued, and reading it
 * is a different feature.
 */

function issueLines(
  issues: readonly {
    title: string;
    status: string;
    priority: string;
    resolution: string | null;
    responsible?: string | null;
  }[],
): string[] {
  return issues.map((issue) =>
    [
      issue.title,
      `priority ${ISSUE_PRIORITY_LABELS[issue.priority as keyof typeof ISSUE_PRIORITY_LABELS] ?? issue.priority}`,
      `status ${ISSUE_STATUS_LABELS[issue.status as keyof typeof ISSUE_STATUS_LABELS] ?? issue.status}`,
      issue.responsible ? `responsible ${issue.responsible}` : null,
      issue.resolution ? `resolution recorded: ${issue.resolution}` : "no resolution recorded",
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

function photoLines(
  photos: readonly { category: string; caption: string | null }[],
): string[] {
  return photos.map(
    (photo) => photoPrintLabelText(photo) ?? "a photograph with no status or caption recorded",
  );
}

async function documentLines(
  supabase: Client,
  parent: Parameters<typeof loadReferencedDocuments>[1],
): Promise<string[]> {
  const referenced = await loadReferencedDocuments(supabase, parent);
  return referenced.flatMap((entry) => {
    const resolved = resolveDocument(entry.snapshot, entry.live);
    if (!resolved) return [];
    return [
      [
        resolved.title,
        resolved.typeLabel,
        resolved.reference ? `ref ${resolved.reference}` : null,
        resolved.revision ? `rev ${resolved.revision}` : null,
        resolved.documentDate ? formatDate(resolved.documentDate) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    ];
  });
}

/** The written sections of a Daily Report, in report order. */
export function dailySections(
  rows: readonly { section_type: string; content: string | null; ai_generated: boolean }[],
): CurrentSection[] {
  const byType = new Map(rows.map((row) => [row.section_type, row]));
  return REPORT_SECTIONS.map((definition) => {
    const row = byType.get(definition.type);
    return {
      sectionType: definition.type,
      label: definition.label,
      content: row?.content ?? null,
      aiGenerated: row?.ai_generated ?? true,
    };
  }).filter((section) => (section.content ?? "").trim().length > 0);
}

export async function buildDailyReviewContext(
  supabase: Client,
  reportId: string,
): Promise<{ input: MasterReviewInput; sections: CurrentSection[] } | { error: string }> {
  const { data: report } = await supabase
    .from("reports")
    .select(
      "id, project_id, report_number, report_date, weather, author_name, raw_notes, projects(name, client, site_address, project_reference)",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "That report could not be found." };

  const [{ data: sectionRows }, { data: workforce }, { data: plant }, { data: photos }, { data: issues }] =
    await Promise.all([
      supabase
        .from("report_sections")
        .select("section_type, content, ai_generated")
        .eq("report_id", reportId),
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
      supabase
        .from("issues")
        .select("title, status, priority, responsible, resolution")
        .eq("report_id", reportId),
    ]);

  const sections = dailySections(sectionRows ?? []);
  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;

  return {
    sections,
    input: {
      documentKind: "DAILY SITE REPORT",
      projectName: project?.name ?? "Project",
      client: project?.client ?? null,
      siteAddress: project?.site_address ?? null,
      periodLabel: formatDate(report.report_date) ?? report.report_date,
      reportNumber: reportNumberLabel(report.report_number),
      sections: sections.map<ReviewableSection>((section) => ({
        type: section.sectionType,
        label: section.label,
        content: section.content ?? "",
        aiGenerated: section.aiGenerated,
      })),
      evidence: [
        {
          heading: "THE SITE MANAGER'S RAW NOTES (what the sections were written from)",
          lines: report.raw_notes?.trim() ? [report.raw_notes.trim()] : [],
        },
        {
          heading: "RECORDED CONDITIONS",
          lines: [
            project?.project_reference ? `Project reference: ${project.project_reference}` : null,
            report.weather ? `Weather: ${report.weather}` : null,
            report.author_name ? `Reported by: ${report.author_name}` : null,
          ].filter((line): line is string => Boolean(line)),
        },
        {
          heading: "WORKFORCE ON SITE",
          lines: (workforce ?? []).map(
            (row) =>
              `${row.company_name}${row.trade ? ` (${row.trade})` : ""}: ${row.operatives} operative(s)`,
          ),
        },
        {
          heading: "PLANT AND EQUIPMENT",
          lines: (plant ?? []).map((row) => `${row.description} x${row.quantity}`),
        },
        {
          heading: "ISSUES RAISED ON THIS REPORT",
          lines: issueLines(issues ?? []),
        },
        {
          heading: "PHOTOGRAPHS (status and caption only - the images are not re-read)",
          lines: photoLines(photos ?? []),
        },
        {
          heading: "SUPPORTING DOCUMENTS (metadata only - contents are not parsed)",
          lines: await documentLines(supabase, {
            table: "report_documents",
            column: "report_id",
            id: reportId,
          }),
        },
      ],
    },
  };
}

export async function buildSummaryReviewContext(
  supabase: Client,
  reportId: string,
): Promise<{ input: MasterReviewInput; sections: CurrentSection[] } | { error: string }> {
  const { data: report } = await supabase
    .from("summary_reports")
    .select(
      "id, project_id, kind, number, title, period_start, period_end, projects(name, client, site_address, project_reference)",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "That report could not be found." };

  const [{ data: sectionRows }, { data: sources }, { data: photoLinks }, { data: issueLinks }] =
    await Promise.all([
      supabase
        .from("summary_report_sections")
        .select("section_type, content, ai_generated")
        .eq("summary_report_id", reportId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("summary_report_sources")
        .select("report_id, source_summary_report_id, via_summary_report_id")
        .eq("summary_report_id", reportId),
      supabase
        .from("summary_report_photos")
        .select("photo_id, caption_override")
        .eq("summary_report_id", reportId),
      supabase
        .from("summary_report_issues")
        .select("issue_id, status_at_issue, resolution_at_issue")
        .eq("summary_report_id", reportId),
    ]);

  const definitions = summarySectionsFor(report.kind);
  const byType = new Map((sectionRows ?? []).map((row) => [row.section_type, row]));
  const sections: CurrentSection[] = definitions
    .map((definition) => {
      const row = byType.get(definition.type);
      return {
        sectionType: definition.type,
        label: definition.label,
        content: row?.content ?? null,
        aiGenerated: row?.ai_generated ?? true,
      };
    })
    .filter((section) => (section.content ?? "").trim().length > 0);

  // Provenance is summarised, never re-fed. The consolidated sections already
  // contain what those reports said; sending the source prose again would
  // double the cost and invite the reviewer to consolidate a second time. The
  // via rows are counted separately so a Daily Report reached through a
  // Progress Report is not listed twice.
  const rows = sources ?? [];
  const progressCount = rows.filter((row) => row.source_summary_report_id).length;
  const directDaily = rows.filter((row) => row.report_id && !row.via_summary_report_id).length;
  const viaDaily = rows.filter((row) => row.report_id && row.via_summary_report_id).length;

  const photoIds = (photoLinks ?? []).map((row) => row.photo_id);
  const issueIds = (issueLinks ?? []).map((row) => row.issue_id);
  const [{ data: photos }, { data: issues }] = await Promise.all([
    photoIds.length
      ? supabase.from("photos").select("id, category, caption").in("id", photoIds)
      : Promise.resolve({ data: [] as { id: string; category: string; caption: string | null }[] }),
    issueIds.length
      ? supabase
          .from("issues")
          .select("id, title, status, priority, responsible, resolution")
          .in("id", issueIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const captionById = new Map(
    (photoLinks ?? []).map((row) => [row.photo_id, row.caption_override]),
  );
  const statusById = new Map(
    (issueLinks ?? []).map((row) => [
      row.issue_id,
      { status: row.status_at_issue, resolution: row.resolution_at_issue },
    ]),
  );

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
  const kindLabel = SUMMARY_KIND_LABELS[report.kind];

  return {
    sections,
    input: {
      documentKind: kindLabel.toUpperCase(),
      projectName: project?.name ?? "Project",
      client: project?.client ?? null,
      siteAddress: project?.site_address ?? null,
      periodLabel:
        report.period_start && report.period_end
          ? `${formatDate(report.period_start)} to ${formatDate(report.period_end)}`
          : "the whole project",
      reportNumber: formatReportNumber(report.number),
      sections: sections.map<ReviewableSection>((section) => ({
        type: section.sectionType,
        label: section.label,
        content: section.content ?? "",
        aiGenerated: section.aiGenerated,
      })),
      evidence: [
        {
          heading: "WHAT THIS DOCUMENT WAS BUILT FROM (counts only - the source prose is not repeated)",
          lines: [
            progressCount > 0
              ? `${progressCount} issued Progress Report(s) consolidated directly`
              : null,
            directDaily > 0 ? `${directDaily} Daily Report(s) consolidated directly` : null,
            viaDaily > 0
              ? `${viaDaily} further Daily Report(s) recorded as provenance beneath those Progress Reports, and already counted in them`
              : null,
            report.title ? `Title given by the site manager: ${report.title}` : null,
            project?.project_reference ? `Project reference: ${project.project_reference}` : null,
          ].filter((line): line is string => Boolean(line)),
        },
        {
          heading: "ISSUES PRESENTED IN THIS DOCUMENT",
          lines: issueLines(
            (issues ?? []).map((issue) => ({
              ...issue,
              status: statusById.get(issue.id)?.status ?? issue.status,
              resolution: statusById.get(issue.id)?.resolution ?? issue.resolution,
            })),
          ),
        },
        {
          heading: "PHOTOGRAPHS SELECTED (status and caption only - the images are not re-read)",
          lines: photoLines(
            (photos ?? []).map((photo) => ({
              category: photo.category,
              caption: captionById.get(photo.id) ?? photo.caption,
            })),
          ),
        },
        {
          heading: "SUPPORTING DOCUMENTS (metadata only - contents are not parsed)",
          lines: await documentLines(supabase, {
            table: "summary_report_documents",
            column: "summary_report_id",
            id: reportId,
          }),
        },
      ],
    },
  };
}
