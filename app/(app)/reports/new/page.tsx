import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, Mic } from "lucide-react";

import { openSiteCapture } from "@/app/(app)/reports/capture-actions";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Site Capture" };

export default async function NewReportPage() {
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await withClockSkewRetry(() =>
    supabase
      .from("projects")
      .select("id, name, client, site_address, postcode, project_reference, status")
      .eq("company_id", session.companyId)
      .neq("status", "completed")
      // An enquiry is not a job yet, so there is nothing to write a day's
      // record against. Surveys are started from the store or the project.
      .neq("status", "survey")
      .order("updated_at", { ascending: false }),
  );

  // Shown in place rather than thrown - see LoadError.
  const projects = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          Site Capture
        </h1>
        <p className="text-sm text-ink-muted">
          Choose your site to start today&apos;s report or continue its draft.
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
                <form action={openSiteCapture} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <input type="hidden" name="projectId" value={project.id} />
                  <div id={`site-${project.id}`} className="min-w-0 flex-1 space-y-1 wrap-anywhere">
                    <h2 className="font-semibold text-ink">{project.name}</h2>
                    {project.project_reference && (
                      <p className="text-sm font-medium text-ink">Ref {project.project_reference}</p>
                    )}
                    <p className="text-sm text-ink-muted">
                      {[project.client, project.site_address, project.postcode].filter(Boolean).join(" · ") ||
                        "No client or address recorded"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <ProjectStatusBadge status={project.status} />
                    <Button type="submit" size="md" aria-describedby={`site-${project.id}`}>
                      <Mic aria-hidden />
                      Capture
                    </Button>
                  </div>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
