"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "@/types/database";

export type ProjectFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

/** Turns an empty form field into null rather than an empty string. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

/** Browsers submit "" for an untouched date input; treat that as no date. */
const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a valid date")
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

const projectSchema = z
  .object({
    name: z.string().trim().min(2, "Give the project a name"),
    client: optionalText,
    site_address: optionalText,
    postcode: optionalText,
    project_reference: optionalText,
    site_manager: optionalText,
    start_date: optionalDate,
    expected_completion_date: optionalDate,
    description: optionalText,
    status: z.enum(["active", "on_hold", "completed"]),
  })
  .refine(
    (values) =>
      !values.start_date ||
      !values.expected_completion_date ||
      values.expected_completion_date >= values.start_date,
    {
      message: "Completion cannot be before the start date",
      path: ["expected_completion_date"],
    },
  );

function parse(formData: FormData) {
  return projectSchema.safeParse({
    name: formData.get("name") ?? "",
    client: formData.get("client") ?? "",
    site_address: formData.get("site_address") ?? "",
    postcode: formData.get("postcode") ?? "",
    project_reference: formData.get("project_reference") ?? "",
    site_manager: formData.get("site_manager") ?? "",
    start_date: formData.get("start_date") ?? "",
    expected_completion_date: formData.get("expected_completion_date") ?? "",
    description: formData.get("description") ?? "",
    status: (formData.get("status") as ProjectStatus) ?? "active",
  });
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...parsed.data,
      company_id: session.companyId,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) return { error: `Could not save the project: ${error.message}` };

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  await requireSessionContext();
  const supabase = await createClient();

  // No company_id filter needed: RLS already limits this to the caller's company.
  const { error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", projectId);

  if (error) return { error: `Could not save your changes: ${error.message}` };

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function deleteProject(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;

  await requireSessionContext();
  const supabase = await createClient();

  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    throw new Error(`Could not delete the project: ${error.message}`);
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect("/projects");
}
