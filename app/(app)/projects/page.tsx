import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, HardHat, Plus } from "lucide-react";

import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await withClockSkewRetry(() =>
    supabase
      .from("projects")
      .select("id, name, client, site_address, project_reference, status")
      // Active first, then on hold, then completed; newest within each group.
      .order("status", { ascending: true })
      .order("created_at", { ascending: false }),
  );

  if (error) {
    throw new Error(`Could not load your projects: ${error.message}`);
  }

  const projects = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Projects</h1>
        {projects.length > 0 ? (
          <Button asChild>
            <Link href="/projects/new">
              <Plus aria-hidden />
              New
            </Link>
          </Button>
        ) : null}
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No projects yet"
          description="A project holds the site details, and every report and photo belongs to one. Start here."
          action={
            <Button asChild size="lg">
              <Link href="/projects/new">
                <Plus aria-hidden />
                Create your first project
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Card className="transition-colors hover:border-line-strong">
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-4 p-5"
                >
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
                  <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
