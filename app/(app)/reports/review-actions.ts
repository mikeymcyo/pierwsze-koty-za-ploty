"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { reviewReportAsWhole } from "@/lib/ai/master-review";
import { requireSessionContext } from "@/lib/auth/session";
import {
  REVIEW_NEEDS_DRAFT,
  reconcileReview,
  sectionsToApply,
  describeApplied,
  type MasterReview,
} from "@/lib/reports/master-review";
import {
  buildDailyReviewContext,
  buildSummaryReviewContext,
} from "@/lib/reports/review-context";
import { createClient } from "@/lib/supabase/server";
import type { ReportSectionType, SummarySectionType } from "@/types/database";

export type MasterReviewState = { error?: string; review?: MasterReview };
export type ApplyReviewState = { error?: string; message?: string };

/**
 * Reviews an assembled report and returns the proposal. Writes nothing.
 *
 * The separation is the safety design, and it is the same one the photograph
 * descriptions use: this action produces advice, the user decides, and a
 * second action writes only what they ticked. A report cannot be changed by
 * running a review, only by accepting part of one.
 */
export async function reviewDailyReport(
  reportId: string,
  _previous: MasterReviewState,
  _formData: FormData,
): Promise<MasterReviewState> {
  return runReview("daily", reportId);
}

export async function reviewSummaryReportAction(
  reportId: string,
  _previous: MasterReviewState,
  _formData: FormData,
): Promise<MasterReviewState> {
  return runReview("summary", reportId);
}

async function runReview(
  kind: "daily" | "summary",
  reportId: string,
): Promise<MasterReviewState> {
  if (!z.uuid().safeParse(reportId).success) return { error: "That report could not be found." };

  await requireSessionContext();
  const supabase = await createClient();

  // An issued report is not reviewed in place. Its stored PDF is the record,
  // and a review that could rewrite the text behind it would let the two
  // disagree. Reopening first is the existing, deliberate route.
  const { data: report } =
    kind === "daily"
      ? await supabase.from("reports").select("status").eq("id", reportId).maybeSingle()
      : await supabase.from("summary_reports").select("status").eq("id", reportId).maybeSingle();
  if (!report) return { error: "That report could not be found." };
  if (report.status === "final") return { error: REVIEW_NEEDS_DRAFT };

  const context =
    kind === "daily"
      ? await buildDailyReviewContext(supabase, reportId)
      : await buildSummaryReviewContext(supabase, reportId);
  if ("error" in context) return { error: context.error };

  if (context.sections.length === 0) {
    return { error: "There is nothing to review yet. Write or draft a section or two first." };
  }

  const result = await reviewReportAsWhole(context.input);
  if (!result.ok) return { error: result.error };

  return {
    review: reconcileReview(
      context.sections,
      result.sections,
      result.warnings,
      result.assessment,
    ),
  };
}

/**
 * Saves the sections the user accepted, and only those.
 *
 * The review travels back through the form rather than being stored, because a
 * review is advice about a moment and is worthless once the report moves on.
 * It is reconciled against the report again here, so a section edited in
 * another tab between reviewing and accepting is written from what the user
 * actually saw - and a section they did not tick is not in the list at all.
 *
 * `ai_generated` is deliberately left alone. A section somebody wrote by hand
 * and then polished is still theirs, and must keep its protection from the
 * ordinary section regeneration.
 */
export async function applyDailyReview(
  reportId: string,
  _previous: ApplyReviewState,
  formData: FormData,
): Promise<ApplyReviewState> {
  return applyReview("daily", reportId, formData);
}

export async function applySummaryReview(
  reportId: string,
  _previous: ApplyReviewState,
  formData: FormData,
): Promise<ApplyReviewState> {
  return applyReview("summary", reportId, formData);
}

const payloadSchema = z.object({
  sections: z.array(
    z.object({
      sectionType: z.string().min(1),
      proposedText: z.string(),
    }),
  ),
});

async function applyReview(
  kind: "daily" | "summary",
  reportId: string,
  formData: FormData,
): Promise<ApplyReviewState> {
  if (!z.uuid().safeParse(reportId).success) return { error: "That report could not be found." };

  const accepted = formData.getAll("accept").map(String);
  if (accepted.length === 0) return { message: describeApplied(0) };

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(String(formData.get("review") ?? "{}")));
  } catch {
    return { error: "That review could not be read. Run it again." };
  }

  await requireSessionContext();
  const supabase = await createClient();

  const { data: report } =
    kind === "daily"
      ? await supabase.from("reports").select("status, project_id").eq("id", reportId).maybeSingle()
      : await supabase
          .from("summary_reports")
          .select("status, project_id")
          .eq("id", reportId)
          .maybeSingle();
  if (!report) return { error: "That report could not be found." };
  if (report.status === "final") return { error: REVIEW_NEEDS_DRAFT };

  const context =
    kind === "daily"
      ? await buildDailyReviewContext(supabase, reportId)
      : await buildSummaryReviewContext(supabase, reportId);
  if ("error" in context) return { error: context.error };

  const review = reconcileReview(context.sections, payload.sections, [], "");
  const writes = sectionsToApply(review, accepted);

  for (const write of writes) {
    // Safe to assert: reconcileReview above discards any section type the
    // report does not actually have, so only real ones reach here.
    const sectionType = write.sectionType as ReportSectionType & SummarySectionType;
    const { error } =
      kind === "daily"
        ? await supabase
            .from("report_sections")
            .update({ content: write.content, updated_at: new Date().toISOString() })
            .eq("report_id", reportId)
            .eq("section_type", sectionType as ReportSectionType)
        : await supabase
            .from("summary_report_sections")
            .update({ content: write.content, updated_at: new Date().toISOString() })
            .eq("summary_report_id", reportId)
            .eq("section_type", sectionType as SummarySectionType);
    if (error) return { error: `Could not save the review: ${error.message}` };
  }

  const path = kind === "daily" ? `/reports/${reportId}` : `/summary-reports/${reportId}`;
  revalidatePath(path);
  revalidatePath(`/projects/${report.project_id}`);
  return { message: describeApplied(writes.length) };
}
