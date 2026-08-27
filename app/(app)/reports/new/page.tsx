import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, Plus } from "lucide-react";

import { startReport } from "@/app/(app)/reports/actions";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create report" };

export default async function NewReportPage() {
  await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await withClockSkewRetry(() =>
    supabase
      .from("projects")
      .select("id, name, client, site_address, status")
      .neq("status", "completed")
      .order("updated_at", { ascending: false }),
  );

  // Shown in place rather than thrown - see LoadError.
  const projects = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Create report
        </h1>
        <p className="text-sm text-ink-muted">
          Pick the site you are on. The date, your name and the report number are
          filled in for you.
        </p>
      </header>

      {error ? (
        <LoadError what="your projects" code={error.code} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="You need a project first"
          description="Reports are always attached to a project, so that's where to start."
          action={
            <Button asChild variant="secondary">
              <Link href="/projects">Go to projects</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Card>
                <form action={startReport} className="flex items-center gap-4 p-5">
                  <input type="hidden" name="projectId" value={project.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{project.name}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {[project.client, project.site_address].filter(Boolean).join(" · ") ||
                        "No client or address recorded"}
                    </p>
                  </div>
                  <ProjectStatusBadge status={project.status} />
                  <Button type="submit" size="md" className="shrink-0">
                    <Plus aria-hidden />
                    Start
                  </Button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
