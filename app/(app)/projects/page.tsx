import type { Metadata } from "next";
import { HardHat } from "lucide-react";

import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, client, site_address, project_reference, status")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load your projects: ${error.message}`);
  }

  const projects = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Projects</h1>

      {projects.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No projects yet"
          description="Creating and editing projects arrives with the next build. Your account and company are already set up and ready for them."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{project.name}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {[project.client, project.site_address].filter(Boolean).join(" · ") ||
                        "No client or address recorded"}
                    </p>
                    {project.project_reference ? (
                      <p className="mt-1 text-xs font-medium text-ink-subtle">
                        Ref {project.project_reference}
                      </p>
                    ) : null}
                  </div>
                  <ProjectStatusBadge status={project.status} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
