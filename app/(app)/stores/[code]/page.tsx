import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  ClipboardList,
  FolderOpen,
  MapPin,
  Mic,
  Moon,
  Navigation,
  Plus,
} from "lucide-react";

import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { openSiteCapture } from "@/app/(app)/reports/capture-actions";
import { CaptureInProgress } from "@/components/reports/capture-in-progress";
import { requireSessionContext } from "@/lib/auth/session";
import {
  captureInProgress,
  splitProjects,
  type DraftDaily,
} from "@/lib/reports/continuity";
import { captureCount } from "@/lib/reports/capture-log";
import { workingDay } from "@/lib/reports/working-day";
import { findStoreAnywhere } from "@/lib/stores/catalogue";
import { directionsUrl, wazeUrl } from "@/lib/stores/directions";
import { newProjectHref } from "@/lib/stores/project-link";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const store = findStoreAnywhere(code);
  return { title: store ? `${store.displayName} · ${store.displayCode}` : "Store" };
}

/**
 * One store.
 *
 * The facts the client's list holds, a way to get there, and a way to start a
 * job here. Nothing is shown that the list does not actually contain - a store
 * whose night shift has not been reviewed says so rather than implying there
 * is not one.
 */
export default async function StorePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireSessionContext();
  const { code } = await params;
  const store = findStoreAnywhere(code);
  if (!store) notFound();

  const directions = directionsUrl(store);
  const waze = wazeUrl(store);

  // The projects this company has run here. RLS scopes it to the caller's own
  // company, so a shared store page shows each company only its own work -
  // the directory is shared, the jobs in it are not.
  const supabase = await createClient();
  const { data: projects, error: projectsError } = await withClockSkewRetry(() =>
    supabase
      .from("projects")
      .select("id, name, project_reference, status, start_date")
      .eq("location_directory", store.directoryId)
      .eq("location_code", store.code)
      .order("status", { ascending: true })
      .order("created_at", { ascending: false }),
  );
  const here = projects ?? [];

  /**
   * The Daily Reports still open on this store's projects.
   *
   * This is the query the page was missing. The store-to-project link was
   * always written and always read; what nothing looked for was whether one of
   * those projects had a Daily somebody was part-way through - so a site
   * manager who had dictated into one that morning was shown "Create project
   * here" and took it, because it was the only thing on the screen that looked
   * like an answer.
   */
  const { data: draftRows } = here.length
    ? await withClockSkewRetry(() =>
        supabase
          .from("reports")
          .select("id, project_id, report_number, report_date, updated_at, raw_notes")
          .in(
            "project_id",
            here.map((project) => project.id),
          )
          .eq("status", "draft")
          .order("updated_at", { ascending: false }),
      )
    : { data: [] };

  const nameById = new Map(here.map((project) => [project.id, project.name]));
  const drafts: DraftDaily[] = (draftRows ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    projectName: nameById.get(row.project_id) ?? "This project",
    reportNumber: row.report_number,
    reportDate: row.report_date,
    updatedAt: row.updated_at,
    captureCount: captureCount(row.raw_notes),
  }));
  const inProgress = captureInProgress(drafts, workingDay());
  const { current, historical } = splitProjects(
    here.map((project) => ({
      id: project.id,
      name: project.name,
      reference: project.project_reference,
      status: project.status,
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/stores">Store locator</BackLink>

      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink-muted">{store.client}</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          {store.displayName}
        </h1>
        <p className="font-mono text-sm font-semibold tabular-nums text-ink-muted">
          Store {store.displayCode}
        </p>
      </header>

      {/* What is already happening here, before anything that starts something
          new. A site manager standing at this store is far more likely to be
          continuing work than beginning it, and the screen used to say the
          opposite by putting Create project here above the fold and the
          project he already had below it. */}
      {inProgress ? <CaptureInProgress draft={inProgress} where={`Store ${store.displayCode}`} /> : null}

      {current.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
            {current.length === 1 ? "Project here" : "Projects here"}
          </h2>
          <ul className="flex flex-col gap-3">
            {current.map((project) => (
              <li key={project.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{project.name}</p>
                        {project.reference ? (
                          <p className="truncate text-sm text-ink-muted">Ref {project.reference}</p>
                        ) : null}
                      </div>
                      <ProjectStatusBadge status={project.status} />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button asChild variant="secondary" className="sm:flex-1">
                        <Link href={`/projects/${project.id}`}>
                          <FolderOpen aria-hidden />
                          Open project
                        </Link>
                      </Button>
                      {/* Opens today's Daily Report if there is one and starts
                          it if there is not - never a second one for the same
                          project and day. See openSiteCapture. */}
                      {inProgress?.projectId === project.id ? null : (
                        <form action={openSiteCapture} className="sm:flex-1">
                          <input type="hidden" name="projectId" value={project.id} />
                          <Button type="submit" className="w-full">
                            <Mic aria-hidden />
                            Start Site Capture
                          </Button>
                        </form>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Detail label="Address" value={store.address} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Postcode" value={store.postcode} />
            <Detail label="RDC" value={store.rdc} />
          </div>
          <Detail
            label="Night shift"
            value={
              store.nightShift === null
                ? "Not reviewed"
                : store.nightShift
                  ? store.nightShiftHours ?? "Yes"
                  : "No"
            }
            icon={store.nightShift ? <Moon className="size-4" aria-hidden /> : null}
            muted={store.nightShift === null}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        {directions ? (
          <Button asChild size="lg" variant="secondary" className="sm:flex-1">
            {/* A plain Google Maps link: it opens the Maps app on an iPhone or
                iPad when it is installed and the website when it is not, needs
                no API key, and cannot stop working because a billing account
                lapsed. */}
            <a href={directions} target="_blank" rel="noopener noreferrer">
              <MapPin aria-hidden />
              Directions
            </a>
          </Button>
        ) : null}
        {waze ? (
          <Button asChild size="lg" variant="secondary" className="sm:flex-1">
            {/* Waze's universal link, on the same terms: the app on a phone
                that has it, the Waze website on one that does not, and the
                store's point rather than its address wherever the directory
                carries one. */}
            <a href={waze} target="_blank" rel="noopener noreferrer">
              <Navigation aria-hidden />
              Waze
            </a>
          </Button>
        ) : null}
      </div>

      {/* The visit that happens before there is a job. Starting one from here
          creates the enquiry it needs to keep its photographs and documents,
          so nothing has to be set up first. */}
      {/* Starting something new. Secondary, and below the work already here:
          a store that already carries a job almost never needs a second one,
          and offering it first is how a duplicate project gets created. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" variant="secondary" className="sm:flex-1">
          <Link href={`/surveys/new?directory=${store.directoryId}&store=${store.code}`}>
            <ClipboardList aria-hidden />
            Start a site survey
          </Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="sm:flex-1">
          <Link href={newProjectHref(store)}>
            <Plus aria-hidden />
            {current.length > 0 ? "Create another project here" : "Create project here"}
          </Link>
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          {historical.length > 0 ? "Earlier work here" : "Projects at this store"}
        </h2>
        {projectsError ? (
          <p className="text-sm text-ink-muted">
            The project list could not be loaded. The store details above are unaffected.
          </p>
        ) : here.length === 0 ? (
          <p className="text-sm text-ink-muted">
            None yet. A store is the place; a project is one package of works at it, and the
            same store can carry several over the years - each with its own reports, issues
            and photographs.
          </p>
        ) : historical.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Everything at this store is live, and listed above.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {historical.map((project) => (
              <li key={project.id}>
                <Card className="transition-colors hover:border-line-strong">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-4 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{project.name}</p>
                      {project.reference ? (
                        <p className="truncate text-sm text-ink-muted">Ref {project.reference}</p>
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
      </section>
    </div>
  );
}

function Detail({
  label,
  value,
  icon,
  muted,
}: {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      <p
        className={
          muted
            ? "flex items-center gap-2 text-ink-subtle"
            : "flex items-center gap-2 text-ink"
        }
      >
        {icon}
        {value ?? "Not recorded"}
      </p>
    </div>
  );
}
