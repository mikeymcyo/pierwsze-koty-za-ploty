"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { runExtraction } from "@/lib/documents/extractions";
import {
  appendBriefEntry,
  briefAlreadyEnds,
  briefHasDocument,
  documentEntryText,
  hasJobBrief,
} from "@/lib/projects/job-brief";
import { workingDay } from "@/lib/reports/working-day";
import { createClient } from "@/lib/supabase/server";

export type JobBriefState = {
  error?: string;
  saved?: boolean;
  /**
   * Nothing was added because the box was empty.
   *
   * Separate from `error` on purpose: on a project that already has a brief
   * this is not a fault at all, and the screen must not colour it as one.
   */
  empty?: boolean;
};

/** `2026-09-01 14:38`, on the British clock the rest of the app keeps. */
function stampNow(at?: string | null): string {
  if (typeof at === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(at)) {
    return `${workingDay()} ${at}`;
  }
  const now = new Date();
  return `${workingDay()} ${String(now.getUTCHours()).padStart(2, "0")}:${String(
    now.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

const entrySchema = z.object({
  text: z.string().trim(),
  at: z.string().trim(),
});

/**
 * What to say when somebody adds nothing.
 *
 * It depends entirely on whether the job already has a brief, and getting that
 * wrong is what this fix is for: a project with a scope recorded that morning
 * was shown "Say or type the job brief first" in red, which says the job has no
 * brief. It has one. The empty box is for adding another entry, not for
 * supplying a missing first one.
 */
function nothingToAdd(hasBrief: boolean): JobBriefState {
  return hasBrief
    ? { empty: true }
    : { error: "Say or type the job brief first", empty: true };
}

/** How many times an append re-reads and tries again when another device got there first. */
const APPEND_ATTEMPTS = 3;

/**
 * Adds one entry to a project's job brief.
 *
 * Append-only, like Site Capture and for the same reason: what was said first
 * has to stay first. The write is conditional on the description still being
 * what was just read, so two people adding to the brief at once cannot
 * overwrite one another - see addCapture, which this mirrors.
 *
 * Nothing here writes to a report, references a document in one, or appends
 * anything to a PDF. The job brief is context; those are three other acts.
 */
export async function addJobBriefEntry(
  projectId: string,
  _previous: JobBriefState,
  formData: FormData,
): Promise<JobBriefState> {
  const parsed = entrySchema.safeParse({
    text: formData.get("brief_text") ?? "",
    at: formData.get("brief_at") ?? "",
  });
  if (!parsed.success) return { error: "That could not be saved - please try again." };

  await requireSessionContext();
  const supabase = await createClient();
  const stamp = stampNow(parsed.data.at);

  for (let attempt = 0; attempt < APPEND_ATTEMPTS; attempt += 1) {
    const { data: project, error: readError } = await supabase
      .from("projects")
      .select("id, description")
      .eq("id", projectId)
      .maybeSingle();
    if (readError) return { error: `Could not read the project: ${readError.message}` };
    if (!project) return { error: "That project could not be found." };

    // Read first, then decide what an empty box means. A brief already
    // recorded - including a plain description written before any of this
    // existed - means the job has a brief, and adding nothing to it is not a
    // missing brief.
    if (!parsed.data.text) return nothingToAdd(hasJobBrief(project.description));

    // A tap that looked like it did nothing gets tapped again. The second one
    // is answered rather than written.
    if (briefAlreadyEnds(project.description, parsed.data.text, stamp)) return { saved: true };

    const next = appendBriefEntry(project.description, parsed.data.text, stamp);
    const write = supabase.from("projects").update({ description: next }).eq("id", projectId);
    const { data: saved, error: writeError } = await (project.description === null
      ? write.is("description", null)
      : write.eq("description", project.description)
    )
      .select("id")
      .maybeSingle();

    if (writeError) return { error: `Could not save the job brief: ${writeError.message}` };
    if (saved) {
      revalidatePath(`/projects/${projectId}`);
      return { saved: true };
    }
  }

  return {
    error: "Somebody else is editing the job brief right now. Your words are still here - try again.",
  };
}

const documentSchema = z.object({ documentId: z.uuid() });

/**
 * Brings an uploaded document into the job scope.
 *
 * The document itself is already stored - this is the separate act of saying
 * the AI may read it as scope. It is recorded as a brief entry with the time on
 * it, so a purchase order that arrived at half past two is on the record as
 * having arrived at half past two, after the spoken brief rather than instead
 * of it.
 *
 * It does NOT reference the document in any report and does NOT append it to
 * any PDF. Those remain separate choices on separate screens.
 */
export async function addJobBriefDocument(
  projectId: string,
  _previous: JobBriefState,
  formData: FormData,
): Promise<JobBriefState> {
  const parsed = documentSchema.safeParse({ documentId: String(formData.get("documentId") ?? "") });
  if (!parsed.success) return { error: "That document could not be found." };

  const session = await requireSessionContext();
  const supabase = await createClient();

  // Read through the project, so a document from another project - or another
  // company, which row-level security already refuses - cannot be named as
  // this job's scope.
  const { data: document } = await supabase
    .from("documents")
    .select("id, title, project_id")
    .eq("id", parsed.data.documentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!document) return { error: "That document is not on this project." };

  const { data: project } = await supabase
    .from("projects")
    .select("id, description")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { error: "That project could not be found." };

  // The mark that decides what the AI reads. The brief entry below is the
  // history of somebody saying so; this row is the standing fact, and it is
  // what lib/documents/job-context.ts reads. Written first, because a brief
  // that records a decision the app then failed to act on is the worse of the
  // two half-states.
  //
  // 23505 is the one-active index: it is already job context, which is not an
  // error and not a second event.
  const { error: markError } = await supabase.from("job_context_documents").insert({
    company_id: session.companyId,
    document_id: document.id,
    added_by: session.userId,
  });
  if (markError && markError.code !== "23505" && markError.code !== "42P01") {
    return { error: `Could not add the document to the job scope: ${markError.message}` };
  }

  // Already scope. Saying so twice would put the same document in the history
  // twice, which is not a second event.
  if (briefHasDocument(project.description, document.id)) return { saved: true };

  const next = appendBriefEntry(
    project.description,
    documentEntryText(document.title, document.id),
    stampNow(),
  );
  const { error } = await supabase
    .from("projects")
    .update({ description: next })
    .eq("id", projectId);
  if (error) return { error: `Could not add the document to the job scope: ${error.message}` };

  revalidatePath(`/projects/${projectId}`);
  return { saved: true };
}

/**
 * Takes a document back out of the AI's reading.
 *
 * A stamp, never a deletion. "This purchase order stopped being scope on
 * Tuesday" is a fact about the job, and a report drafted on Monday was drafted
 * while it still was - so the row stays with removed_at and removed_by on it,
 * and the brief entry recording its arrival stays exactly where it was. The
 * document itself, and any report that references it, are untouched.
 */
export async function removeJobBriefDocument(
  projectId: string,
  _previous: JobBriefState,
  formData: FormData,
): Promise<JobBriefState> {
  const parsed = documentSchema.safeParse({ documentId: String(formData.get("documentId") ?? "") });
  if (!parsed.success) return { error: "That document could not be found." };

  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: document } = await supabase
    .from("documents")
    .select("id")
    .eq("id", parsed.data.documentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!document) return { error: "That document is not on this project." };

  const { error } = await supabase
    .from("job_context_documents")
    .update({ removed_at: new Date().toISOString(), removed_by: session.userId })
    .eq("document_id", document.id)
    .is("removed_at", null);
  if (error && error.code !== "42P01") {
    return { error: `Could not take the document out of the job scope: ${error.message}` };
  }

  revalidatePath(`/projects/${projectId}`);
  return { saved: true };
}

/**
 * Reads a job document, so the AI knows what the paperwork says.
 *
 * A separate act again, and deliberately a button rather than something that
 * happens on upload: reading costs a model call, and a drawing register nobody
 * will use as context should not spend one. Re-reading an already-read
 * document is the same action - the old reading is superseded and kept.
 *
 * Everything it stores was quoted from the document and checked back against
 * the document's own text; see lib/documents/extraction-schema.ts. Nothing it
 * stores is attached to any report or appended to any PDF.
 */
export async function extractJobDocument(
  projectId: string,
  _previous: JobBriefState,
  formData: FormData,
): Promise<JobBriefState> {
  const parsed = documentSchema.safeParse({ documentId: String(formData.get("documentId") ?? "") });
  if (!parsed.success) return { error: "That document could not be found." };

  const session = await requireSessionContext();
  const supabase = await createClient();

  // Read through the project so a document on another job cannot be named, and
  // so the project's name can be given to the model as context.
  const [{ data: document }, { data: project }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, doc_type, storage_path")
      .eq("id", parsed.data.documentId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
  ]);
  if (!document) return { error: "That document is not on this project." };
  if (!project) return { error: "That project could not be found." };

  const result = await runExtraction(
    supabase,
    {
      id: document.id,
      companyId: session.companyId,
      projectName: project.name,
      title: document.title,
      docType: document.doc_type,
      storagePath: document.storage_path,
    },
    session.userId,
  );

  // The row already records the failure and why; the screen shows it from
  // there on the next render, so a reload does not lose it.
  revalidatePath(`/projects/${projectId}`);
  return result.ok ? { saved: true } : { error: result.error };
}
