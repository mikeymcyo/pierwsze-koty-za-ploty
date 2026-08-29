import type { Metadata } from "next";
import Link from "next/link";

import { createProject } from "@/app/(app)/projects/actions";
import { ProjectForm } from "@/components/projects/project-form";
import { requireSessionContext } from "@/lib/auth/session";
import { storeFor } from "@/lib/stores/catalogue";
import { storeProjectDefaults } from "@/lib/stores/project-link";

export const metadata: Metadata = { title: "New project" };

/**
 * A new project, optionally starting from a store in the directory.
 *
 * The store is named in the address bar and looked up here rather than having
 * its fields passed in, so what the form is filled with is always what the
 * directory actually says. Everything remains editable, and a project created
 * without a store behaves exactly as it always has - store selection is an
 * offer, never a requirement.
 */
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ directory?: string; store?: string }>;
}) {
  await requireSessionContext();
  const search = await searchParams;
  const store =
    search.directory && search.store ? storeFor(search.directory, search.store) : null;

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
        defaults={store ? storeProjectDefaults(store) : undefined}
        banner={
          store ? (
            <div className="rounded-2xl border border-line bg-surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                From the store directory
              </p>
              <p className="mt-1 font-semibold text-ink">
                {store.client} {store.displayName}
              </p>
              <p className="font-mono text-sm tabular-nums text-ink-muted">
                Store {store.displayCode}
                {store.rdc ? ` · RDC ${store.rdc}` : ""}
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                The client and site address below have been filled in from the directory. Give
                the project its own name and reference - those describe this package of works,
                not the building.{" "}
                <Link href={`/stores/${store.code}`} className="font-semibold underline">
                  View store
                </Link>
              </p>
            </div>
          ) : null
        }
        submitLabel="Create project"
        cancelHref={store ? `/stores/${store.code}` : "/projects"}
      />
    </div>
  );
}
