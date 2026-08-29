import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin, Moon, Plus } from "lucide-react";

import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { requireSessionContext } from "@/lib/auth/session";
import { findStoreAnywhere } from "@/lib/stores/catalogue";
import { directionsUrl } from "@/lib/stores/directions";
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
        <Button asChild size="lg" className="sm:flex-1">
          <Link href={newProjectHref(store)}>
            <Plus aria-hidden />
            Create project here
          </Link>
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          Projects at this store
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
        ) : (
          <ul className="flex flex-col gap-3">
            {here.map((project) => (
              <li key={project.id}>
                <Card className="transition-colors hover:border-line-strong">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-4 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{project.name}</p>
                      {project.project_reference ? (
                        <p className="truncate text-sm text-ink-muted">
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
