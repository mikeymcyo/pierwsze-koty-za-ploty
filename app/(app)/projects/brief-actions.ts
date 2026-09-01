"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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

/**
 * The page an action was used from, so it re-renders with the result.
 *
 * The same forms sit on Site Capture and on the project overview. Each action
 * always revalidates the project; this adds the screen the form was actually
 * on. Only a path on this app is accepted - anything else is ignored rather
 * than passed to the router.
 */
function returnPath(formData: FormData): string | null {
  const value = String(formData.get("return_to") ?? "").trim();
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function revalidateFrom(projectId: string, formData: FormData): void {
  revalidatePath(`/projects/${projectId}`);
  const back = returnPath(formData);
  if (back && back !== `/projects/${projectId}`) revalidatePath(back);
}

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
      revalidateFrom(projectId, formData);
      return { saved: true };
    }
  }

  return {
    error: "Somebody else is editing the job brief right now. Your words are still here - try again.",
  };
}

const documentSchema = z.object({ documentId: z.uuid() });

/**
 * A document added on Site Capture: context now, read in the background.
 *
 * Somebody adding a purchase order from the van is adding it because it
 * describes the job. There is no second question. The uploader on Site
 * Capture calls this once the file is stored: the document is marked as job
 * context at once, its arrival goes into the brief as history, and the
 * reading is scheduled to run after the response has gone back - so the
 * button says "added" in a second and never says anything about reading.
 *
 * The three writes are still three writes to three tables. Nothing here is a
 * report reference or a PDF attachment, and the Documents tab still uploads
 * without implying either.
 */
export async function adoptJobDocument(
  projectId: string,
  returnTo: string,
  documentId: string,
): Promise<{ error?: string }> {
  const parsed = documentSchema.safeParse({ documentId });
  if (!parsed.success) return { error: "That document could not be found." };

  const session = await requireSessionContext();
  const supabase = await createClient();

  const [{ data: document }, { data: project }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, doc_type, storage_path")
      .eq("id", parsed.data.documentId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase.from("projects").select("id, name, description").eq("id", projectId).maybeSingle(),
  ]);
  if (!document) return { error: "That document is not on this project." };
  if (!project) return { error: "That project could not be found." };

  const { error: markError } = await supabase.from("job_context_documents").insert({
    company_id: session.companyId,
    document_id: document.id,
    added_by: session.userId,
  });
  if (markError && markError.code !== "23505" && markError.code !== "42P01") {
    return { error: `Could not add the document to the job context: ${markError.message}` };
  }

  if (!briefHasDocument(project.description, document.id)) {
    const next = appendBriefEntry(
      project.description,
      documentEntryText(document.title, document.id),
      stampNow(),
    );
    await supabase.from("projects").update({ description: next }).eq("id", projectId);
  }

  // Read in the background, after this response has gone back. The worker
  // sees "added" at once and nothing about reading; Prepare Daily catches up
  // any document this did not get to read, and says so once if one cannot be.
  const target = {
    id: document.id,
    companyId: session.companyId,
    projectName: project.name,
    title: document.title,
    docType: document.doc_type,
    storagePath: document.storage_path,
  };
  after(async () => {
    const result = await runExtraction(supabase, target, session.userId);
    if (!result.ok) console.warn(`[siteboss] background read of ${document.title} failed: ${result.error}`);
  });

  revalidatePath(`/projects/${projectId}`);
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) revalidatePath(returnTo);
  return {};
}
