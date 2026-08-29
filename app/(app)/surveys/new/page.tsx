import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { SurveyCreateForm, type SurveyProjectChoice } from "@/components/surveys/survey-create-form";
import { BackLink } from "@/components/ui/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { storeFor } from "@/lib/stores/catalogue";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New site survey" };

/**
 * Starting a survey, from a store or from a project.
 *
 * Reached from a store when the work is only being priced and no project
 * exists, and from a project when there is already one to attach it to. Both
 * arrive here rather than at two different screens, because the survey itself
 * is the same document either way.
 */
export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ directory?: string; store?: string; project?: string }>;
}) {
  await requireSessionContext();
  const search = await searchParams;
  const supabase = await createClient();

  const store =
    search.directory && search.store ? storeFor(search.directory, search.store) : null;

  const { data, error } = await withClockSkewRetry(() =>
    supabase
      .from("projects")
      .select("id, name, status")
      .neq("status", "completed")
      .order("updated_at", { ascending: false }),
  );
  const projects: SurveyProjectChoice[] = (data ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    isEnquiry: project.status === "survey",
  }));

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={store ? `/stores/${store.code}` : "/reports"}>
        {store ? "Store" : "All reports"}
      </BackLink>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          New site survey
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          A visit made before works, to investigate, measure and photograph so the job can be
          priced.
        </p>
      </header>

      {error ? (
        <LoadError what="your projects" code={error.code} />
      ) : !store && projects.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Start from a store, or create a project first"
          description="A survey needs somewhere to keep its photographs and documents. Starting one from the Store locator creates that for you as an enquiry."
        />
      ) : (
        <SurveyCreateForm
          projects={projects}
          store={
            store
              ? {
                  directoryId: store.directoryId,
                  code: store.code,
                  displayName: store.displayName,
                  displayCode: store.displayCode,
                  client: store.client,
                }
              : null
          }
          defaultProjectId={search.project}
          today={new Date().toISOString().slice(0, 10)}
        />
      )}
    </div>
  );
}
