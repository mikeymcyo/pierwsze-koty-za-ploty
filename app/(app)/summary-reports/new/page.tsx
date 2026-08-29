import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { SummaryCreateForm } from "@/components/summary-reports/summary-create-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import type { SummaryReportKind } from "@/types/database";

export const metadata: Metadata = { title: "Create summary report" };

export default async function NewSummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; project?: string }>;
}) {
  const { kind, project } = await searchParams;
  // A survey is not built from issued evidence, so it has its own flow. Sending
  // somebody here with ?kind=survey would quietly start a Progress Report.
  if (kind === "survey") {
    redirect(project ? `/surveys/new?project=${project}` : "/surveys/new");
  }
  await requireSessionContext();
  const supabase = await createClient();
  const { data, error } = await withClockSkewRetry(() =>
    supabase.from("projects").select("id, name").order("updated_at", { ascending: false }),
  );
  const projects = data ?? [];
  const defaultKind: SummaryReportKind = kind === "completion" ? "completion" : "progress";

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 self-start">
        <Link href="/reports"><ArrowLeft aria-hidden />All reports</Link>
      </Button>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Create consolidated report</h1>
        <p className="mt-1 text-sm text-ink-muted">Build a client document from reports that have already been checked and issued.</p>
      </header>
      {error ? (
        <LoadError what="your projects" code={error.code} />
      ) : projects.length === 0 ? (
        <EmptyState icon={FileText} title="You need a project first" description="Progress and Completion Reports always belong to a project." />
      ) : (
        <SummaryCreateForm projects={projects} defaultProjectId={project} defaultKind={defaultKind} />
      )}
    </div>
  );
}
