import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, Mic } from "lucide-react";

import { openSiteCapture } from "@/app/(app)/reports/capture-actions";
import { FieldCapture } from "@/components/reports/field-capture";
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
      .select("id, name, client, site_address, status")
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
          Pick the site you are on. If today&apos;s report is already going, this
          opens it where you left off - it never starts a second one.
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
            <li key={session.userId + ":" + session.companyId + ":" + project.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-3 p-5">

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{project.name}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {[project.client, project.site_address].filter(Boolean).join(" · ") ||
                        "No client or address recorded"}
                    </p>
                  </div>
                  <ProjectStatusBadge status={project.status} />
                  <FieldCapture userId={session.userId} companyId={session.companyId} projectId={project.id} projectName={project.name} />
                  <form action={openSiteCapture}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <Button type="submit" variant="secondary" size="md" className="shrink-0">
                      <Mic aria-hidden />
                      Open daily report
                    </Button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
