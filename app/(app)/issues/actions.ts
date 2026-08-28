"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { closedAtFor, hasRequiredResolution } from "@/lib/issues/metadata";
import { createClient } from "@/lib/supabase/server";

/**
 * Issues: raised on site, tracked against the project.
 *
 * `report_id` is nullable by design and its foreign key is
 * `on delete set null (report_id)` - an issue outlives the report it was first
 * noticed in, because the defect is still there after the day's paperwork is
 * filed. So the same actions serve both places it can be raised from: the
 * report being written, which is the site workflow, and the project's own
 * Open Issues tab.
 *
 * `photo_id` likewise already exists, with a composite foreign key against
 * (photos.id, company_id) - a photo can only be attached to an issue in the
 * same company even if RLS were bypassed. No migration was needed for any of
 * this.
 */

export type IssueFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  created?: boolean;
  saved?: boolean;
};

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .refine((value) => value === null || z.uuid().safeParse(value).success, "Pick a valid photo");

const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["open", "in_progress", "closed"] as const;

const createSchema = z.object({
  projectId: z.uuid(),
  reportId: optionalUuid,
  title: z.string().trim().min(3, "Say what the issue is"),
  description: optionalText,
  responsible: optionalText,
  photoId: optionalUuid,
  priority: z.enum(PRIORITIES),
});

const updateSchema = z.object({
  title: z.string().trim().min(3, "Say what the issue is"),
  description: optionalText,
  resolution: optionalText,
  responsible: optionalText,
  photoId: optionalUuid,
  priority: z.enum(PRIORITIES),
  status: z.enum(STATUSES),
}).superRefine((value, context) => {
  if (!hasRequiredResolution(value.status, value.resolution)) {
    context.addIssue({
      code: "custom",
      path: ["resolution"],
      message: "Record how this issue was resolved before closing it",
    });
  }
});

function read(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/**
 * Raises an issue, from a report or from the project.
 *
 * Returns rather than redirects: raised from the capture screen, the site
 * manager is mid-report and being thrown somewhere else would lose his place.
 */
export async function createIssue(
  _prev: IssueFormState,
  formData: FormData,
): Promise<IssueFormState> {
  const parsed = createSchema.safeParse({
    projectId: read(formData, "projectId"),
    reportId: read(formData, "reportId"),
    title: read(formData, "title"),
    description: read(formData, "description"),
    resolution: read(formData, "resolution"),
    responsible: read(formData, "responsible"),
    photoId: read(formData, "photoId"),
    priority: read(formData, "priority"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const session = await requireSessionContext();
  const supabase = await createClient();
  const input = parsed.data;

  const { error } = await supabase.from("issues").insert({
    company_id: session.companyId,
    project_id: input.projectId,
    report_id: input.reportId,
    title: input.title,
    description: input.description,
    responsible: input.responsible,
    photo_id: input.photoId,
    priority: input.priority,
    status: "open",
    created_by: session.userId,
  });

  if (error) return { error: `Could not raise the issue: ${error.message}` };

  // Both places it can appear from, so it shows up under Open Issues straight
  // away rather than after a hard refresh.
  revalidatePath(`/projects/${input.projectId}`);
  if (input.reportId) revalidatePath(`/reports/${input.reportId}`);
  return { created: true };
}

export async function updateIssue(
  issueId: string,
  _prev: IssueFormState,
  formData: FormData,
): Promise<IssueFormState> {
  const parsed = updateSchema.safeParse({
    title: read(formData, "title"),
    description: read(formData, "description"),
    responsible: read(formData, "responsible"),
    photoId: read(formData, "photoId"),
    priority: read(formData, "priority"),
    status: read(formData, "status"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  await requireSessionContext();
  const supabase = await createClient();

  // Read first for closed_at and for the paths to revalidate. RLS keeps this to
  // the caller's own company, so a missing row means "not yours" as much as
  // "not there" - and both answer the same way.
  const { data: existing } = await supabase
    .from("issues")
    .select("project_id, report_id, closed_at")
    .eq("id", issueId)
    .maybeSingle();

  if (!existing) return { error: "That issue could not be found." };

  const input = parsed.data;
  const { error } = await supabase
    .from("issues")
    .update({
      title: input.title,
      description: input.description,
      resolution: input.status === "closed" ? input.resolution : null,
      responsible: input.responsible,
      photo_id: input.photoId,
      priority: input.priority,
      status: input.status,
      closed_at: closedAtFor(input.status, existing.closed_at),
    })
    .eq("id", issueId);

  if (error) return { error: `Could not save the issue: ${error.message}` };

  revalidatePath(`/projects/${existing.project_id}`);
  if (existing.report_id) revalidatePath(`/reports/${existing.report_id}`);
  return { saved: true };
}

/**
 * Moves an issue between open, in progress and closed.
 *
 * Separate from updateIssue so the list can carry a one-tap control: changing
 * where something stands is the common action on site, and making it a trip to
 * an edit form would mean it does not get done.
 */
export async function setIssueStatus(formData: FormData) {
  const parsed = z
    .object({ issueId: z.uuid(), status: z.enum(STATUSES) })
    .safeParse({
      issueId: read(formData, "issueId"),
      status: read(formData, "status"),
    });

  if (!parsed.success) return;

  // Closing needs a recorded resolution, so it goes through the edit screen.
  if (parsed.data.status === "closed") return;

  await requireSessionContext();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("issues")
    .select("project_id, report_id, closed_at")
    .eq("id", parsed.data.issueId)
    .maybeSingle();

  if (!existing) return;

  const { error } = await supabase
    .from("issues")
    .update({
      status: parsed.data.status,
      closed_at: closedAtFor(parsed.data.status, existing.closed_at),
    })
    .eq("id", parsed.data.issueId);

  if (error) throw new Error(`Could not update the issue: ${error.message}`);

  revalidatePath(`/projects/${existing.project_id}`);
  if (existing.report_id) revalidatePath(`/reports/${existing.report_id}`);
}
