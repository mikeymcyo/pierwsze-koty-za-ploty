import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, Plus } from "lucide-react";

import { ProjectRow } from "@/components/projects/project-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { tallyOpenIssues } from "@/lib/projects/row-summary";
import { storeFor } from "@/lib/stores/catalogue";
import { storeLinkOf } from "@/lib/stores/project-link";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireSessionContext();
  const supabase = await createClient();

  const [projectsResult, issuesResult] = await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("projects")
        .select(
          "id, name, client, site_address, project_reference, status, location_directory, location_code",
        )
        // Active first, then on hold, then completed; newest within each group.
        .order("status", { ascending: true })
        .order("created_at", { ascending: false }),
    ),
    // One flat query rather than a count per card: ids only, tallied here.
    // RLS keeps it to this company, so a card can never count another's work.
    withClockSkewRetry(() =>
      supabase.from("issues").select("project_id").neq("status", "closed"),
    ),
  ]);

  const { data, error } = projectsResult;
  // Shown in place rather than thrown - see LoadError.
  const projects = data ?? [];
  // An outstanding-issue count is a nicety; failing to get one is not worth
  // holding the whole list back for, so the cards simply do not mention it.
  const openIssues = tallyOpenIssues(issuesResult.data ?? []);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Projects</h1>
        {!error && projects.length > 0 ? (
          <Button asChild>
            <Link href="/projects/new">
              <Plus aria-hidden />
              New
            </Link>
          </Button>
        ) : null}
      </header>

      {/* An empty list and a failed query look identical from here, so the
          "no projects yet" story is only told when the query actually worked. */}
      {error ? (
        <LoadError what="your projects" code={error.code} />
      ) : projects.length === 0 ? (
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
        <>
          <ul className="flex flex-col gap-3">
            {projects.map((project) => {
              const link = storeLinkOf(project);
              return (
                <li key={project.id}>
                  <ProjectRow
                    project={project}
                    store={link ? storeFor(link.directory, link.code) : null}
                    openIssues={openIssues.get(project.id) ?? 0}
                  />
                </li>
              );
            })}
          </ul>
          <p className="text-center text-xs text-ink-subtle">
            Swipe a project left, or use its menu, for Edit and Delete.
          </p>
        </>
      )}
    </div>
  );
}
