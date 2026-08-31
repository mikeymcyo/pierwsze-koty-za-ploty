"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { PDF_BUCKET } from "@/lib/pdf/signing";
import { dependentsOfSummaryReport } from "@/lib/reports/dependents";
import { canDelete } from "@/lib/reports/lifecycle";
import { SUMMARY_REPORT_IS_FINAL } from "@/lib/summary-reports/finalisation";
import { noSourcesMessage, sourceModeOf } from "@/lib/summary-reports/provenance";
import { summarySectionsFor } from "@/lib/summary-reports/sections";
import {
  resolveDailySelection,
  selectedPeriod,
  type SelectableDaily,
} from "@/lib/summary-reports/daily-selection";
import {
  resolveProgressSelection,
  type SelectableProgress,
} from "@/lib/summary-reports/progress-selection";
import { completionSourcePlan } from "@/lib/summary-reports/source-plan";
import { createClient } from "@/lib/supabase/server";
import type { SummaryReportKind } from "@/types/database";

export type DeleteState = { error?: string };

export type SummaryFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  saved?: boolean;
};

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value ? value : null));

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a valid date");

const createSchema = z
  .object({
    projectId: z.uuid(),
    kind: z.enum(["progress", "completion"]),
    title: optionalText,
    periodStart: optionalDate,
    periodEnd: optionalDate,
    /**
     * Whether this report consolidates issued reports or is written directly.
     * Both kinds may be either: a job can finish without a Daily Report ever
     * having been filed. See lib/summary-reports/provenance.ts.
     */
    sourceMode: z.enum(["sources", "standalone"]),
    /**
     * The Daily Reports a Progress Report was told to consolidate. Empty on a
     * Completion Report, which consolidates issued Progress Reports and keeps
     * its own flow, and on a standalone report, which consolidates nothing.
     */
    reportIds: z.array(z.uuid()),
    /**
     * The Progress Reports a Completion Report was told to consolidate. Empty
     * on a Progress Report and on a standalone one.
     */
    progressIds: z.array(z.uuid()),
  })
  .superRefine((value, context) => {
    if ((value.periodStart === null) !== (value.periodEnd === null)) {
      context.addIssue({
        code: "custom",
        path: [value.periodStart === null ? "periodStart" : "periodEnd"],
        message: "Enter both dates or leave both blank",
      });
    }
    if (value.periodStart && value.periodEnd && value.periodEnd < value.periodStart) {
      context.addIssue({ code: "custom", path: ["periodEnd"], message: "End after the start date" });
    }
  });

function errorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

function stringOf(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/**
 * Starts a report and freezes its evidence list.
 *
 * Progress uses final Daily Reports in the selected period. Completion prefers
 * issued Progress Reports, records their Daily Reports underneath as `via`
 * provenance, and adds any remaining final Daily Reports directly.
 *
 * A Progress Report can also be written directly, with no Daily Reports behind
 * it - the real case where the work was reported by phone or by message rather
 * than written up on site. It then has no sources at all, which is exactly
 * what stops it claiming any: no source rows, no source record in the PDF, and
 * a drafting prompt told plainly that there are none. See
 * lib/summary-reports/provenance.ts.
 */
export async function startSummaryReport(
  _previous: SummaryFormState,
  formData: FormData,
): Promise<SummaryFormState> {
  const parsed = createSchema.safeParse({
    projectId: stringOf(formData, "projectId"),
    kind: stringOf(formData, "kind"),
    title: stringOf(formData, "title"),
    periodStart: stringOf(formData, "periodStart"),
    periodEnd: stringOf(formData, "periodEnd"),
    sourceMode: sourceModeOf(stringOf(formData, "sourceMode")),
    // Deduplicated before it is even validated. A form can post the same value
    // twice; a report must never carry the same source row twice.
    reportIds: Array.from(new Set(formData.getAll("reportIds").map(String).filter(Boolean))),
    progressIds: Array.from(new Set(formData.getAll("progressIds").map(String).filter(Boolean))),
  });
  if (!parsed.success) return { fieldErrors: errorsOf(parsed.error) };

  const session = await requireSessionContext();
  const supabase = await createClient();
  const input = parsed.data;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle();
  if (!project) return { error: "That project could not be found." };

  // A standalone report is not built from issued reports, so it does not go
  // looking for any. Nothing is linked, nothing is frozen, and nothing can
  // later be mistaken for provenance. True of a Completion Report as much as a
  // Progress one: the job that was reported by phone still finishes.
  const standalone = input.sourceMode === "standalone";

  const { data: allDaily, error: dailyError } = standalone
    ? { data: [], error: null }
    : await supabase
        .from("reports")
        .select("id, report_number, report_date, finalised_at")
        .eq("project_id", input.projectId)
        .eq("status", "final")
        .order("report_date", { ascending: true })
        .order("report_number", { ascending: true });
  if (dailyError) return { error: `Could not read the Daily Reports: ${dailyError.message}` };

  const available: SelectableDaily[] = (allDaily ?? []).map((report) => ({
    id: report.id,
    number: report.report_number,
    date: report.report_date,
    issuedAt: report.finalised_at,
    usedIn: null,
  }));

  /**
   * A Progress Report consolidates the reports it was told to consolidate.
   *
   * The list from the form is a request, not an authority: it is intersected
   * with the issued Daily Reports this project actually has, which are the
   * only ones row-level security let us read. A posted id belonging to another
   * company's project, to a draft, or to nothing at all therefore cannot
   * become a source row - and the intersection is over a Set, so a duplicated
   * id cannot either.
   *
   * A Completion Report is unchanged: it prefers issued Progress Reports and
   * takes the remaining dailies in its period, which is its own established
   * flow.
   */
  const daily =
    input.kind === "progress" && !standalone
      ? resolveDailySelection(input.reportIds, available)
      : available.filter(
          (report) =>
            (!input.periodStart || report.date >= input.periodStart) &&
            (!input.periodEnd || report.date <= input.periodEnd),
        );

  // Told to consolidate, told nothing to consolidate. Saying so beats building
  // a Progress Report that quietly claims no evidence at all.
  if (input.kind === "progress" && !standalone && daily.length === 0) {
    return {
      error:
        input.reportIds.length > 0
          ? "None of the reports you chose are still issued Daily Reports on this project."
          : "Choose at least one Daily Report to consolidate, or write the report directly.",
    };
  }

  /**
   * The period the document states.
   *
   * Where the author typed dates, those are what the report says. Where they
   * left them blank, the span of what was actually selected is the honest
   * answer - a report headed "1 to 14 August" that consolidated three days of
   * that fortnight tells the reader something untrue about its own coverage.
   */
  const span =
    input.kind === "progress" && !standalone && !input.periodStart && !input.periodEnd
      ? selectedPeriod(daily)
      : null;
  const periodStart = input.periodStart ?? span?.start ?? null;
  const periodEnd = input.periodEnd ?? span?.end ?? null;

  const sources: {
    company_id: string;
    summary_report_id: string;
    report_id?: string;
    source_summary_report_id?: string;
    via_summary_report_id?: string;
    sort_order: number;
  }[] = [];

  const progressForCompletion: { id: string; period_start: string | null; period_end: string | null }[] = [];
  const viaByDaily = new Map<string, string>();

  if (input.kind === "completion" && !standalone) {
    const { data: progress, error: progressError } = await supabase
      .from("summary_reports")
      .select("id, number, period_start, period_end, finalised_at")
      .eq("project_id", input.projectId)
      .eq("kind", "progress")
      .eq("status", "final")
      .order("number", { ascending: true });
    if (progressError) return { error: `Could not read the Progress Reports: ${progressError.message}` };

    /**
     * The Progress Reports the author ticked, intersected with the issued ones
     * this company may actually read - the same rule as the Daily picker, and
     * for the same reason: the form is a request, not an authority.
     *
     * A Completion Report started before the picker existed, or from a link
     * that carries no selection, still gets every issued Progress Report.
     * Falling back to none would quietly turn a whole-project record into one
     * built from raw dailies.
     */
    const availableProgress: SelectableProgress[] = (progress ?? []).map((report) => ({
      id: report.id,
      number: report.number,
      periodStart: report.period_start,
      periodEnd: report.period_end,
      issuedAt: report.finalised_at,
      dailyIds: [],
    }));
    progressForCompletion.push(
      ...(input.progressIds.length > 0
        ? resolveProgressSelection(input.progressIds, availableProgress)
        : availableProgress
      ).map((report) => ({
        id: report.id,
        period_start: report.periodStart,
        period_end: report.periodEnd,
      })),
    );

    if (progressForCompletion.length > 0) {
      const { data: underlying, error: sourceError } = await supabase
        .from("summary_report_sources")
        .select("summary_report_id, report_id")
        .in(
          "summary_report_id",
          progressForCompletion.map((report) => report.id),
        )
        .not("report_id", "is", null)
        .order("sort_order", { ascending: true });
      if (sourceError) return { error: `Could not read report provenance: ${sourceError.message}` };
      for (const source of underlying ?? []) {
        if (source.report_id && !viaByDaily.has(source.report_id)) {
          viaByDaily.set(source.report_id, source.summary_report_id);
        }
      }
    }
  }

  // Only a report that asked to consolidate can fail for having nothing to
  // consolidate. Standalone was chosen deliberately and has nothing to find.
  if (!standalone && daily.length === 0 && progressForCompletion.length === 0) {
    return { error: noSourcesMessage(input.kind) };
  }

  const { data: summary, error: createError } = await supabase
    .from("summary_reports")
    .insert({
      company_id: session.companyId,
      project_id: input.projectId,
      kind: input.kind,
      title: input.title,
      period_start: periodStart,
      period_end: periodEnd,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (createError) return { error: `Could not start the report: ${createError.message}` };

  let order = 0;
  if (input.kind === "progress") {
    for (const report of daily) {
      sources.push({
        company_id: session.companyId,
        summary_report_id: summary.id,
        report_id: report.id,
        sort_order: order++,
      });
    }
  } else {
    const plan = completionSourcePlan(
      daily.map((report) => report.id),
      progressForCompletion.map((progress) => ({
        id: progress.id,
        dailyIds: Array.from(viaByDaily.entries())
          .filter(([, via]) => via === progress.id)
          .map(([dailyId]) => dailyId),
      })),
    );
    for (const progressId of plan.progressIds) {
      sources.push({
        company_id: session.companyId,
        summary_report_id: summary.id,
        source_summary_report_id: progressId,
        sort_order: order++,
      });
    }
    for (const dailySource of plan.daily) {
      sources.push({
        company_id: session.companyId,
        summary_report_id: summary.id,
        report_id: dailySource.id,
        ...(dailySource.via ? { via_summary_report_id: dailySource.via } : {}),
        sort_order: order++,
      });
    }
  }

  // Nothing to freeze on a standalone report, and an empty insert would be a
  // round trip that says nothing.
  if (sources.length > 0) {
    const { error: sourcesError } = await supabase.from("summary_report_sources").insert(sources);
    if (sourcesError) {
      await supabase.from("summary_reports").delete().eq("id", summary.id);
      return { error: `Could not save the report evidence: ${sourcesError.message}` };
    }
  }

  const { error: sectionsError } = await supabase.from("summary_report_sections").insert(
    summarySectionsFor(input.kind).map((section, index) => ({
      company_id: session.companyId,
      summary_report_id: summary.id,
      section_type: section.type,
      content: null,
      ai_generated: true,
      sort_order: index,
    })),
  );
  if (sectionsError) {
    await supabase.from("summary_reports").delete().eq("id", summary.id);
    return { error: `Could not prepare the report sections: ${sectionsError.message}` };
  }

  const sourceDailyIds = daily.map((report) => report.id);
  if (sourceDailyIds.length > 0) {
    const { data: photos } = await supabase
      .from("photos")
      .select("id")
      .in("report_id", sourceDailyIds)
      .order("created_at", { ascending: true });
    if (photos?.length) {
      await supabase.from("summary_report_photos").insert(
        photos.map((photo, index) => ({
          company_id: session.companyId,
          summary_report_id: summary.id,
          photo_id: photo.id,
          sort_order: index,
        })),
      );
    }
  }

  const { data: projectIssues } = await supabase
    .from("issues")
    .select("id, status, resolution, created_at, closed_at")
    .eq("project_id", input.projectId)
    .order("created_at", { ascending: true });
  const relevantIssues = (projectIssues ?? []).filter(
    (issue) =>
      (!periodEnd || issue.created_at.slice(0, 10) <= periodEnd) &&
      (!periodStart || !issue.closed_at || issue.closed_at.slice(0, 10) >= periodStart),
  );
  if (relevantIssues.length) {
    await supabase.from("summary_report_issues").insert(
      relevantIssues.map((issue, index) => ({
        company_id: session.companyId,
        summary_report_id: summary.id,
        issue_id: issue.id,
        sort_order: index,
        status_at_issue: issue.status,
        resolution_at_issue: issue.resolution,
      })),
    );
  }

  revalidatePath("/reports");
  revalidatePath(`/projects/${input.projectId}`);
  redirect(`/summary-reports/${summary.id}`);
}

const detailsSchema = z.object({ title: optionalText });

export async function saveSummaryDetails(
  reportId: string,
  _previous: SummaryFormState,
  formData: FormData,
): Promise<SummaryFormState> {
  const parsed = detailsSchema.safeParse({
    title: stringOf(formData, "title"),
  });
  if (!parsed.success) return { fieldErrors: errorsOf(parsed.error) };

  await requireSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("summary_reports")
    .update({
      title: parsed.data.title,
    })
    .eq("id", reportId)
    .eq("status", "draft")
    .select("project_id")
    .maybeSingle();
  if (error) return { error: `Could not save the report: ${error.message}` };
  if (!data) return { error: SUMMARY_REPORT_IS_FINAL };
  revalidatePath(`/summary-reports/${reportId}`);
  revalidatePath(`/projects/${data.project_id}`);
  return { saved: true };
}

export async function saveSummaryCuration(
  reportId: string,
  _previous: SummaryFormState,
  formData: FormData,
): Promise<SummaryFormState> {
  // A survey manages its photographs in place and its curation form carries
  // no photograph fields at all. Without this marker an issue-only save would
  // read as "nothing selected" and delete every plate in the report.
  const photosIncluded = formData.get("photosIncluded") !== null;
  const requestedPhotos = photosIncluded ? formData.getAll("photoId").map(String) : [];
  const requestedIssues = formData.getAll("issueId").map(String);
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("summary_reports")
    .select("project_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "That report could not be found." };
  if (report.status === "final") return { error: SUMMARY_REPORT_IS_FINAL };

  const [{ data: photos }, { data: issues }] = await Promise.all([
    requestedPhotos.length
      ? supabase.from("photos").select("id").eq("project_id", report.project_id).in("id", requestedPhotos)
      : Promise.resolve({ data: [] as { id: string }[] }),
    requestedIssues.length
      ? supabase
          .from("issues")
          .select("id, status, resolution")
          .eq("project_id", report.project_id)
          .in("id", requestedIssues)
      : Promise.resolve({ data: [] as { id: string; status: "open" | "in_progress" | "closed"; resolution: string | null }[] }),
  ]);

  /**
   * Photographs are reconciled against what is already linked, never deleted
   * and re-inserted.
   *
   * The old code emptied the table and wrote the selection back with
   * `sort_order: index` taken from the order PostgREST happened to return the
   * rows in. So arranging the plates and then touching this form - ticking one
   * more photograph, correcting one caption - silently scrambled the order the
   * report would print in, and the tester saw a document that no longer matched
   * the screen they had just arranged.
   *
   * Now a photograph that is staying keeps its position and only its caption is
   * written; one that has been unticked is removed; a new one is appended after
   * everything already there. Nothing that was in order moves.
   */
  const { data: existingLinks, error: existingError } = await supabase
    .from("summary_report_photos")
    .select("photo_id, sort_order, caption_override")
    .eq("summary_report_id", reportId)
    .order("sort_order", { ascending: true });
  if (existingError) {
    return { error: `Could not read the photograph selection: ${existingError.message}` };
  }

  const captionFor = (photoId: string) =>
    String(formData.get(`photoCaption_${photoId}`) ?? "").trim() || null;

  if (photosIncluded) {
    const keeping = new Set((photos ?? []).map((photo) => photo.id));
    const linked = new Map(
      (existingLinks ?? []).map((link) => [link.photo_id, link] as const),
    );

    const dropped = (existingLinks ?? [])
      .map((link) => link.photo_id)
      .filter((photoId) => !keeping.has(photoId));
    if (dropped.length > 0) {
      const { error } = await supabase
        .from("summary_report_photos")
        .delete()
        .eq("summary_report_id", reportId)
        .in("photo_id", dropped);
      if (error) return { error: `Could not update the selection: ${error.message}` };
    }

    let next = (existingLinks ?? []).reduce(
      (highest, link) => Math.max(highest, link.sort_order),
      -1,
    );
    for (const photo of photos ?? []) {
      const existing = linked.get(photo.id);
      const caption = captionFor(photo.id);
      if (existing) {
        // Only the caption. Writing sort_order here is exactly what lost the
        // arranged order.
        if (existing.caption_override !== caption) {
          const { error } = await supabase
            .from("summary_report_photos")
            .update({ caption_override: caption })
            .eq("summary_report_id", reportId)
            .eq("photo_id", photo.id);
          if (error) return { error: `Could not save the caption: ${error.message}` };
        }
        continue;
      }
      next += 1;
      const { error } = await supabase.from("summary_report_photos").insert({
        company_id: session.companyId,
        summary_report_id: reportId,
        photo_id: photo.id,
        sort_order: next,
        caption_override: caption,
      });
      if (error) return { error: `Could not save the photograph selection: ${error.message}` };
    }
  }

  const { error: issueDeleteError } = await supabase
    .from("summary_report_issues")
    .delete()
    .eq("summary_report_id", reportId);
  if (issueDeleteError) {
    return { error: `Could not update the selection: ${issueDeleteError.message}` };
  }
  if (issues?.length) {
    const { error } = await supabase.from("summary_report_issues").insert(
      issues.map((issue, index) => ({
        company_id: session.companyId,
        summary_report_id: reportId,
        issue_id: issue.id,
        sort_order: index,
        status_at_issue: issue.status,
        resolution_at_issue: issue.resolution,
      })),
    );
    if (error) return { error: `Could not save the issue selection: ${error.message}` };
  }

  revalidatePath(`/summary-reports/${reportId}`);
  return { saved: true };
}

/**
 * Removes a consolidated report.
 *
 * A Completion Report built on this one blocks the delete: its issued PDF
 * cites this document by number, and removing it would strand that reference.
 *
 * Only this document's own PDF is removed from storage. The photographs and
 * Daily Reports underneath belong to the project, not to this report, and are
 * deliberately left where they are - they are evidence for everything else too.
 */
export async function deleteSummaryReport(
  reportId: string,
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  if (!z.uuid().safeParse(reportId).success) return { error: "That report could not be found." };
  await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("summary_reports")
    .select("id, project_id, status, pdf_path")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "That report could not be found." };

  const dependents = await dependentsOfSummaryReport(supabase, reportId);
  const check = canDelete({
    status: report.status,
    dependents,
    typedConfirmation: String(formData.get("confirmation") ?? ""),
  });
  if (!check.ok) return { error: check.message };

  const { error } = await supabase.from("summary_reports").delete().eq("id", reportId);
  if (error) return { error: `Could not delete the report: ${error.message}` };

  if (report.pdf_path) await supabase.storage.from(PDF_BUCKET).remove([report.pdf_path]);

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${report.project_id}`);
  redirect("/reports");
}

export type { SummaryReportKind };
