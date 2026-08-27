import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateProject } from "@/app/(app)/projects/actions";
import { ProjectForm } from "@/components/projects/project-form";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSessionContext();
  const supabase = await createClient();

  const { data: project, error } = await withClockSkewRetry(() =>
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
  );

  // Without the project there is no form to prefill, but the shell and the
  // navigation still work - so say what happened rather than blanking. See
  // LoadError.
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Edit project
        </h1>
        <LoadError what="this project" code={error.code} />
      </div>
    );
  }

  // RLS returns nothing for another company's project, so this covers both
  // "does not exist" and "not yours" without leaking which it was.
  if (!project) notFound();

  const action = updateProject.bind(null, project.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Edit project
        </h1>
        <p className="truncate text-ink-muted">{project.name}</p>
      </header>

      <ProjectForm
        action={action}
        project={project}
        submitLabel="Save changes"
        cancelHref={`/projects/${project.id}`}
      />
    </div>
  );
}
