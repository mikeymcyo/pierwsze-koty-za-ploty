import type { Metadata } from "next";

import { createProject } from "@/app/(app)/projects/actions";
import { ProjectForm } from "@/components/projects/project-form";
import { requireSessionContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireSessionContext();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          New project
        </h1>
        <p className="text-ink-muted">
          Only the name is required. Everything else can be filled in later.
        </p>
      </header>

      <ProjectForm
        action={createProject}
        submitLabel="Create project"
        cancelHref="/projects"
      />
    </div>
  );
}
