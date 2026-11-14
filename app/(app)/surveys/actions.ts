"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { storeFor } from "@/lib/stores/catalogue";
import { storeColumns, storeProjectDefaults } from "@/lib/stores/project-link";
import { createClient } from "@/lib/supabase/server";

/**
 * Starting a site survey.
 *
 * Deliberately its own action rather than a branch inside startSummaryReport.
 * That one exists to freeze a list of already-issued evidence; a survey has no
 * evidence to freeze, because it is made before there is any. Sharing the
 * function would mean threading "except when there is nothing to consolidate"
 * through every step of it.
 *
 * A survey can start from a store, before any project exists - which is the
 * real workflow, since the visit often happens while the work is only being
 * priced. In that case the project is created here at `survey` status: an
 * enquiry, not a live job. That is what lets the survey use the ordinary
 * photograph, document and issue systems, all of which require a project.
 *
 * Nothing stops a store carrying several surveys: each one creates its own
 * enquiry, or attaches to a project already chosen.
 */

export type SurveyFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

const schema = z
  .object({
    /** An existing project, when the survey belongs to one. */
    projectId: z
      .string()
      .trim()
      .transform((value) => (value ? value : null))
      .refine((value) => value === null || z.uuid().safeParse(value).success, "Pick a project"),
    /** Or a store, when this is a fresh enquiry. */
    directory: z.string().trim().transform((value) => (value ? value : null)),
    storeCode: z.string().trim().transform((value) => (value ? value : null)),
    title: z
      .string()
      .trim()
      .transform((value) => (value ? value : null)),
    visitedOn: z
      .string()
      .trim()
      .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter the date of the visit"),
    purpose: z
      .string()
      .trim()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((value, context) => {
    if (!value.projectId && !(value.directory && value.storeCode)) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "Choose an existing project, or start from a store.",
      });
    }
  });

function read(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

export async function startSiteSurvey(
  _previous: SurveyFormState,
  formData: FormData,
): Promise<SurveyFormState> {
  const parsed = schema.safeParse({
    projectId: read(formData, "projectId"),
    directory: read(formData, "directory"),
    storeCode: read(formData, "storeCode"),
    title: read(formData, "title"),
    visitedOn: read(formData, "visitedOn"),
    purpose: read(formData, "purpose"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const session = await requireSessionContext();
  const supabase = await createClient();
  const input = parsed.data;

  let projectId = input.projectId;

  if (!projectId) {
    const store =
      input.directory && input.storeCode ? storeFor(input.directory, input.storeCode) : null;
    if (!store) {
      return { fieldErrors: { projectId: "That store is not in the directory." } };
    }
    const defaults = storeProjectDefaults(store);
    // An enquiry, named for what it is. The store's own details come across so
    // nothing is retyped, and the reference is left blank: that names a package
    // of works, and there is not one yet.
    const { data: created, error: projectError } = await supabase
      .from("projects")
      .insert({
        company_id: session.companyId,
        name: `${store.displayName} - survey`,
        status: "survey",
        client: defaults.client,
        site_address: defaults.site_address,
        postcode: defaults.postcode,
        ...storeColumns({ directory: store.directoryId, code: store.code }),
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (projectError) {
      return { error: `Could not start the enquiry: ${projectError.message}` };
    }
    projectId = created.id;
  } else {
    // RLS already limits this to the caller's company; a missing row means
    // "not yours" as much as "not there", and both answer the same way.
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return { fieldErrors: { projectId: "That project could not be found." } };
  }

  // Both dates carry the visit date: a survey is a day, not a span, and the
  // schema's own CHECK wants either both or neither.
  const { data: survey, error: surveyError } = await supabase
    .from("summary_reports")
    .insert({
      company_id: session.companyId,
      project_id: projectId,
      kind: "survey",
      title: input.title,
      period_start: input.visitedOn,
      period_end: input.visitedOn,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (surveyError) return { error: `Could not start the survey: ${surveyError.message}` };

  if (input.purpose) {
    const { error: sectionError } = await supabase.from("summary_report_sections").insert({
      company_id: session.companyId,
      summary_report_id: survey.id,
      section_type: "survey_purpose",
      content: input.purpose,
      ai_generated: false,
      sort_order: 0,
    });
    // The survey exists either way. Losing the opening line is not a reason to
    // throw away the visit, and it can be typed again on the next screen.
    if (sectionError) console.error("[siteboss] survey purpose not saved:", sectionError);
  }

  revalidatePath("/projects");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  redirect(`/summary-reports/${survey.id}`);
}

/**
 * The work was awarded: this enquiry is a live job now.
 *
 * One tap rather than a trip through the edit form, because it is the moment
 * everything else hangs off - the project starts appearing in active workload,
 * and Daily Reports can be written against it. Nothing else changes: the
 * survey, its photographs, its documents and any issues it raised are already
 * on the project and stay exactly as they are.
 */
export async function awardProject(projectId: string): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(projectId).success) {
    return { error: "That project could not be found." };
  }
  await requireSessionContext();
  const supabase = await createClient();

  // Only an enquiry can be awarded. An already-active or completed project is
  // left alone rather than quietly reset.
  const { data: updated, error } = await supabase
    .from("projects")
    .update({ status: "active" })
    .eq("id", projectId)
    .eq("status", "survey")
    .select("id")
    .maybeSingle();

  if (error) return { error: `Could not update the project: ${error.message}` };
  if (!updated) return { error: "That project is not an enquiry." };

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  return {};
}
