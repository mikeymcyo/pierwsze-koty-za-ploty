"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { displayName, requireSessionContext } from "@/lib/auth/session";
import { alreadyEnded, appendCapture, isCaptureTime } from "@/lib/reports/capture-log";
import { copyPreviousEntries } from "@/lib/reports/carry-over";
import { workingDay } from "@/lib/reports/working-day";
import { REPORT_IS_FINAL } from "@/lib/reports/immutability";
import { createClient } from "@/lib/supabase/server";

export type CaptureState = { error?: string; savedAt?: string };

/**
 * Site Capture: open today's Daily Report for a project, or start it.
 *
 * The whole point of the day-long workflow is that this is idempotent. Tapping
 * Site Capture at 08:00, 10:30 and 14:00 must land on the same report all three
 * times, so an existing draft dated today is opened and nothing is created.
 *
 * The match is deliberately narrow - this project, still a draft, dated today.
 * A draft left over from yesterday is somebody's unfinished report, and
 * appending this morning's work to it would file today's site under
 * yesterday's date. An issued report is not a draft, and is never reopened
 * from here.
 *
 * Today is the British working day, and it is written onto the row rather than
 * left to the column's UTC default - see lib/reports/working-day.ts. The
 * lookup and the insert therefore use the same date, which is what stops
 * 00:30 on a summer night creating a second report for the same night.
 *
 * Where two drafts somehow exist for the same project and day, the oldest wins.
 * It is the one that has been collected into all day, and the one the report
 * number was taken for.
 *
 * A POST rather than a link: it may insert a row and let the database assign a
 * report number, which a GET must never do.
 */
export async function openSiteCapture(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) redirect("/reports/new");

  const session = await requireSessionContext();
  const supabase = await createClient();

  const date = workingDay();

  const { data: existing } = await supabase
    .from("reports")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "draft")
    .eq("report_date", date)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) redirect(`/reports/${existing.id}/capture`);

  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      company_id: session.companyId,
      project_id: projectId,
      author_id: session.userId,
      author_name: displayName(session),
      // Explicit, not the column's UTC default: this has to be the same date
      // the lookup above just asked for.
      report_date: date,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not open Site Capture: ${error.message}`);

  await copyPreviousEntries(supabase, projectId, report.id, session.companyId);

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/reports/${report.id}/capture`);
}

const captureSchema = z.object({
  text: z.string().trim().min(1, "Say or type something first"),
  at: z
    .string()
    .trim()
    .transform((value) => (isCaptureTime(value) ? value : null))
    .nullable(),
});

/** How many times an append will re-read and try again when another device got there first. */
const APPEND_ATTEMPTS = 3;

/**
 * Adds one capture to today's report.
 *
 * Only the new text is submitted. The existing notes are never sent from the
 * browser and never round-trip through the form, so a phone left open since
 * 08:00 cannot overwrite what an iPad added at 10:30 - the worst a stale screen
 * can do is add its text late.
 *
 * The write is conditional on the notes still being what was just read
 * (`.eq("raw_notes", …)`, or `.is(…, null)` for the first capture of the day).
 * PostgREST cannot express `set raw_notes = raw_notes || $1`, so this is the
 * honest alternative: if two devices append at the same instant one of them
 * finds the row changed underneath it, re-reads and appends again, rather than
 * quietly writing over the other's sentence.
 *
 * `status = draft` is in the same filter, which is what keeps an issued report
 * immutable: no row comes back and nothing is written.
 */
export async function addCapture(
  reportId: string,
  _previous: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const parsed = captureSchema.safeParse({
    text: formData.get("capture_text") ?? "",
    at: formData.get("captured_at") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Say or type something first" };
  }

  await requireSessionContext();
  const supabase = await createClient();

  for (let attempt = 0; attempt < APPEND_ATTEMPTS; attempt += 1) {
    const { data: current, error: readError } = await supabase
      .from("reports")
      .select("id, project_id, raw_notes, status")
      .eq("id", reportId)
      .maybeSingle();

    if (readError) return { error: `Could not read the report: ${readError.message}` };
    if (!current) return { error: "That report could not be found." };
    if (current.status !== "draft") return { error: REPORT_IS_FINAL };

    // Already there. A tap on one bar of signal that looks like it did nothing
    // is tapped again, and the reply to the second tap is "yes, that is saved"
    // rather than the same sentence written into the day twice.
    if (alreadyEnded(current.raw_notes, parsed.data.text, parsed.data.at)) {
      return { savedAt: parsed.data.at ?? "" };
    }

    const next = appendCapture(current.raw_notes, parsed.data.text, parsed.data.at);
    if (next === (current.raw_notes ?? "")) return { error: "Say or type something first" };

    const write = supabase.from("reports").update({ raw_notes: next }).eq("id", reportId).eq("status", "draft");
    const { data: saved, error: writeError } = await (current.raw_notes === null
      ? write.is("raw_notes", null)
      : write.eq("raw_notes", current.raw_notes)
    )
      .select("id")
      .maybeSingle();

    if (writeError) return { error: `Could not save the capture: ${writeError.message}` };

    if (saved) {
      revalidatePath(`/reports/${reportId}/capture`);
      revalidatePath(`/reports/${reportId}`);
      revalidatePath("/reports");
      revalidatePath("/dashboard");
      if (current.project_id) revalidatePath(`/projects/${current.project_id}`);
      return { savedAt: parsed.data.at ?? "" };
    }
    // No row: either somebody else appended between the read and the write, in
    // which case reading again picks their text up and this capture goes after
    // it, or the report was issued in the meantime and the next pass says so.
  }

  return {
    error:
      "Somebody else is adding to this report right now. Your words are still in the box - try Save again.",
  };
}
