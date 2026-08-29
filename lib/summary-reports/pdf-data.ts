import "server-only";

import { resolveDocument } from "@/lib/documents/metadata";
import { loadReferencedDocuments } from "@/lib/documents/snapshot";
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS } from "@/lib/issues/metadata";
import type { SummaryPdfData } from "@/lib/pdf/summary-document";
import { reportSite } from "@/lib/reports/site-identity";
import { storeFor } from "@/lib/stores/catalogue";
import { storeLinkOf } from "@/lib/stores/project-link";
import { SUMMARY_SECTION_LABELS, summarySectionOrder } from "@/lib/summary-reports/sections";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadSummaryPdfData(
  supabase: Client,
  reportId: string,
  identity: { companyName: string; issuedBy: string; issuedAt: string },
): Promise<
  | {
      ok: true;
      report: { id: string; project_id: string; status: "draft" | "final"; pdf_path: string | null };
      /**
       * Everything but whether the documents are appended: that is the
       * caller's decision - a preview honours a query parameter and a
       * finalise honours the form - and the register printed inside the
       * report has to agree with what actually follows it.
       */
      data: Omit<SummaryPdfData, "documentsAppended">;
      sourceCount: number;
      sectionCount: number;
    }
  | { ok: false; error: string }
> {
  const { data: report, error } = await supabase
    .from("summary_reports")
    .select(
      "id, project_id, kind, number, revision, title, period_start, period_end, status, pdf_path, projects(name, client, site_address, project_reference, location_directory, location_code)",
    )
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the report: ${error.message}` };
  if (!report) return { ok: false, error: "That report could not be found." };

  const [sectionsResult, sourcesResult, photoLinksResult, issueLinksResult] = await Promise.all([
    supabase
      .from("summary_report_sections")
      .select("section_type, content, sort_order")
      .eq("summary_report_id", reportId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("summary_report_sources")
      .select("report_id, source_summary_report_id, via_summary_report_id, sort_order")
      .eq("summary_report_id", reportId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("summary_report_photos")
      .select("photo_id, caption_override, sort_order")
      .eq("summary_report_id", reportId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("summary_report_issues")
      .select("issue_id, status_at_issue, resolution_at_issue, sort_order")
      .eq("summary_report_id", reportId)
      .order("sort_order", { ascending: true }),
  ]);
  const childError =
    sectionsResult.error ?? sourcesResult.error ?? photoLinksResult.error ?? issueLinksResult.error;
  if (childError) return { ok: false, error: `Could not read the report contents: ${childError.message}` };

  const photoLinks = photoLinksResult.data ?? [];
  const photoIds = photoLinks.map((row) => row.photo_id);
  const { data: photoRows } = photoIds.length
    ? await supabase
        .from("photos")
        .select("id, caption, category, storage_path")
        .in("id", photoIds)
    : { data: [] };
  const photoById = new Map((photoRows ?? []).map((photo) => [photo.id, photo]));
  const downloaded = new Map<string, Buffer>();
  for (const link of photoLinks) {
    const photo = photoById.get(link.photo_id);
    if (!photo) continue;
    const { data: file } = await supabase.storage.from("site-photos").download(photo.storage_path);
    if (file) downloaded.set(photo.id, Buffer.from(await file.arrayBuffer()));
  }

  const issueLinks = issueLinksResult.data ?? [];
  const issueIds = issueLinks.map((row) => row.issue_id);
  const { data: issueRows } = issueIds.length
    ? await supabase
        .from("issues")
        .select("id, title, description, responsible, priority, status, resolution")
        .in("id", issueIds)
    : { data: [] };
  const issueById = new Map((issueRows ?? []).map((issue) => [issue.id, issue]));

  const sources = sourcesResult.data ?? [];
  const dailyIds = sources.flatMap((source) => (source.report_id ? [source.report_id] : []));
  const progressIds = Array.from(
    new Set(
      sources.flatMap((source) =>
        [source.source_summary_report_id, source.via_summary_report_id].filter(Boolean) as string[],
      ),
    ),
  );
  const [{ data: dailyRows }, { data: progressRows }] = await Promise.all([
    dailyIds.length
      ? supabase
          .from("reports")
          .select("id, report_number, report_date")
          .in("id", dailyIds)
      : Promise.resolve({ data: [] as { id: string; report_number: number; report_date: string }[] }),
    progressIds.length
      ? supabase
          .from("summary_reports")
          .select("id, number, period_start, period_end")
          .in("id", progressIds)
      : Promise.resolve({
          data: [] as { id: string; number: number; period_start: string | null; period_end: string | null }[],
        }),
  ]);
  const dailyById = new Map((dailyRows ?? []).map((row) => [row.id, row]));
  const progressById = new Map((progressRows ?? []).map((row) => [row.id, row]));

  const sourceLabels = sources.flatMap((source) => {
    if (source.source_summary_report_id) {
      const progress = progressById.get(source.source_summary_report_id);
      return progress
        ? [`Progress Report ${formatReportNumber(progress.number)}${
            progress.period_start && progress.period_end
              ? ` · ${formatDate(progress.period_start)} to ${formatDate(progress.period_end)}`
              : ""
          }`]
        : [];
    }
    if (source.report_id) {
      const daily = dailyById.get(source.report_id);
      if (!daily) return [];
      const via = source.via_summary_report_id
        ? ` · underlying Progress Report ${formatReportNumber(
            progressById.get(source.via_summary_report_id)?.number ?? 0,
          )}`
        : "";
      return [`Daily Report ${formatReportNumber(daily.report_number)} · ${formatDate(daily.report_date)}${via}`];
    }
    return [];
  });

  const referenced = await loadReferencedDocuments(supabase, {
    table: "summary_report_documents",
    column: "summary_report_id",
    id: reportId,
  });
  const supportingDocuments = referenced.flatMap((entry) => {
    const resolved = resolveDocument(entry.snapshot, entry.live);
    return resolved
      ? [{ ...resolved, documentDate: formatDate(resolved.documentDate) ?? resolved.documentDate }]
      : [];
  });

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;

  // See lib/reports/site-identity.ts: what is written on the project wins, the
  // store fills the gaps, and an already issued PDF is untouched either way.
  const link = project ? storeLinkOf(project) : null;
  const site = reportSite(
    project ?? {},
    link ? storeFor(link.directory, link.code) : null,
  );

  const order = summarySectionOrder(report.kind);
  const sections = (sectionsResult.data ?? [])
    .filter((section) => section.content?.trim() && order.includes(section.section_type))
    .sort((a, b) => order.indexOf(a.section_type) - order.indexOf(b.section_type))
    .map((section) => ({
      type: section.section_type,
      label: SUMMARY_SECTION_LABELS[section.section_type],
      content: section.content?.trim() ?? "",
    }));

  const periodLabel =
    report.period_start && report.period_end
      ? `${formatDate(report.period_start)} to ${formatDate(report.period_end)}`
      : "Whole project record";

  return {
    ok: true,
    report: { id: report.id, project_id: report.project_id, status: report.status, pdf_path: report.pdf_path },
    sourceCount: sources.length,
    sectionCount: sections.length,
    data: {
      kind: report.kind,
      companyName: identity.companyName,
      projectName: project?.name ?? "Project",
      client: site.client,
      siteAddress: site.siteAddress,
      projectReference: project?.project_reference ?? null,
      title: report.title,
      number: formatReportNumber(report.number),
      revision: report.revision,
      periodLabel,
      issuedAt: identity.issuedAt,
      issuedBy: identity.issuedBy,
      sections,
      issues: issueLinks.flatMap((link) => {
        const issue = issueById.get(link.issue_id);
        if (!issue) return [];
        const status = link.status_at_issue ?? issue.status;
        return [
          {
            id: issue.id,
            title: issue.title,
            description: issue.description,
            responsible: issue.responsible,
            priority: issue.priority,
            priorityLabel: ISSUE_PRIORITY_LABELS[issue.priority],
            statusLabel: ISSUE_STATUS_LABELS[status],
            resolution: link.resolution_at_issue ?? issue.resolution,
          },
        ];
      }),
      photos: photoLinks.flatMap((link) => {
        const photo = photoById.get(link.photo_id);
        const data = downloaded.get(link.photo_id);
        if (!photo || !data) return [];
        return [
          {
            id: photo.id,
            caption: link.caption_override?.trim() || photo.caption,
            category: photo.category,
            data,
          },
        ];
      }),
      sourceLabels,
      supportingDocuments,
      store: site.store,
    },
  };
}
