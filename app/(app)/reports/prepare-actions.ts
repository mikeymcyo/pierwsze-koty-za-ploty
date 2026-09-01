"use server";

import { redirect } from "next/navigation";

import { generateReport } from "@/app/(app)/reports/ai-actions";
import { requireSessionContext } from "@/lib/auth/session";
import { documentContextForProject } from "@/lib/documents/job-context";
import { currentExtractions, runExtraction } from "@/lib/documents/extractions";
import { parseCaptureLog } from "@/lib/reports/capture-log";
import { prepareQuestions, shortScope, type PrepareQuestion } from "@/lib/reports/prepare-gate";
import { createClient } from "@/lib/supabase/server";

export type PrepareState = {
  error?: string;
  /** Asked instead of drafting. Answered with the microphone on the same screen. */
  questions?: PrepareQuestion[];
  /** A document added today that could not be read. Said once, here. */
  unreadNote?: string;
};

/**
 * Prepare Daily: the one AI action on Site Capture.
 *
 * Everything clever happens in here and nothing about it is shown. In order:
 *
 *  1. Any document added on Site Capture that has not been read yet is read
 *     now, best effort. Reading usually happened in the background when the
 *     document was added; this is the catch-up for a background that did not
 *     get its chance. A document that cannot be read is said so once and the
 *     draft goes ahead without it.
 *  2. The evidence is weighed - today's notes, today's photographs, the work
 *     the paperwork instructs. If the answer to "is there enough here to say
 *     something true" is no, the questions come back instead of a draft. At
 *     most two, never about workforce or plant, and "Prepare Daily anyway"
 *     is always offered.
 *  3. The draft is written by the same two-pass writer it always was - the
 *     cleanup pass and the drafting pass, with the job's documents held as
 *     what was requested and the notes and photographs as what happened -
 *     and the report opens for review.
 */
export async function prepareDaily(
  reportId: string,
  _previous: PrepareState,
  formData: FormData,
): Promise<PrepareState> {
  const session = await requireSessionContext();
  const supabase = await createClient();
  const force = String(formData.get("force") ?? "") === "1";

  const { data: report } = await supabase
    .from("reports")
    .select("id, project_id, raw_notes, status, projects(name)")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "That report could not be found." };
  if (report.status !== "draft") redirect(`/reports/${reportId}`);

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;

  // 1. Catch up any unread job document.
  let unreadNote: string | undefined;
  const { data: contextRows } = await supabase
    .from("job_context_documents")
    .select("document_id, documents(id, title, doc_type, storage_path, project_id)")
    .is("removed_at", null);
  const contextDocuments = (contextRows ?? [])
    .map((row) => (Array.isArray(row.documents) ? row.documents[0] : row.documents))
    .filter((document) => document && document.project_id === report.project_id);
  if (contextDocuments.length > 0) {
    const readings = await currentExtractions(
      supabase,
      contextDocuments.map((document) => document.id),
    );
    for (const document of contextDocuments) {
      const reading = readings.get(document.id);
      if (reading?.status === "succeeded" || reading?.status === "running") continue;
      const result = await runExtraction(
        supabase,
        {
          id: document.id,
          companyId: session.companyId,
          projectName: project?.name ?? "Project",
          title: document.title,
          docType: document.doc_type,
          storagePath: document.storage_path,
        },
        session.userId,
      );
      if (!result.ok && !/already being read/.test(result.error)) {
        unreadNote = `${document.title} could not be read, so today's Daily is written without it.`;
      }
    }
  }

  // 2. Weigh the evidence.
  const [{ count: photoCount }, jobDocuments] = await Promise.all([
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("report_id", reportId),
    documentContextForProject(supabase, report.project_id),
  ]);
  const notes = parseCaptureLog(report.raw_notes).map((entry) => entry.text);
  const instructedScope = jobDocuments.flatMap((document) =>
    document.scopeItems
      .filter((item) => item.commitment === "instructed")
      .map((item) => shortScope(item.text)),
  );

  if (!force) {
    const questions = prepareQuestions({
      notes,
      photoCount: photoCount ?? 0,
      instructedScope,
    });
    if (questions.length > 0) return { questions, unreadNote };
  }

  // 3. Write it, and go and read it.
  const result = await generateReport(reportId, {}, formData);
  if (result.error) return { error: result.error, unreadNote };
  redirect(`/reports/${reportId}`);
}
