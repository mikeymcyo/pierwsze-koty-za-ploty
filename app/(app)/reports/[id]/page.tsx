import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";

import { deleteReport, saveReport, type ReportFormState } from "@/app/(app)/reports/actions";
import { ReportCaptureForm } from "@/components/reports/report-capture-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Report" };

export default async function ReportCapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);

  await requireSessionContext();
  const supabase = await createClient();

  // RLS scopes this to the caller's company, so an id from another company is
  // indistinguishable from one that does not exist - which is what we want.
  const { data: report, error } = await withClockSkewRetry(() =>
    supabase
      .from("reports")
      .select("*, projects(id, name)")
      .eq("id", id)
      .maybeSingle(),
  );

  if (error) {
    throw new Error(`Could not load the report: ${error.message}`);
  }

  if (!report) notFound();

  const [workforceResult, plantResult] = await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("workforce_entries")
        .select("*")
        .eq("report_id", id)
        .order("sort_order", { ascending: true }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("plant_entries")
        .select("*")
        .eq("report_id", id)
        .order("sort_order", { ascending: true }),
    ),
  ]);

  const loadError = workforceResult.error ?? plantResult.error;
  if (loadError) {
    throw new Error(`Could not load this report's entries: ${loadError.message}`);
  }

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
  const projectHref = project ? `/projects/${project.id}` : "/reports";

  const save = saveReport.bind(null, id) as (
    state: ReportFormState,
    formData: FormData,
  ) => Promise<ReportFormState>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={projectHref}>
            <ArrowLeft aria-hidden />
            {project?.name ?? "Back"}
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Report {formatReportNumber(report.report_number)}
          </h1>
          <p className="text-sm text-ink-muted">
            {[project?.name, formatDate(report.report_date), report.author_name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge tone={report.status === "final" ? "success" : "neutral"}>
          {report.status === "final" ? "Final" : "Draft"}
        </Badge>
      </header>

      <ReportCaptureForm
        action={save}
        report={report}
        workforce={workforceResult.data ?? []}
        plant={plantResult.data ?? []}
        cancelHref={projectHref}
        saved={saved === "1"}
      />

      {report.status === "draft" ? (
        <form action={deleteReport} className="border-t border-line pt-6">
          <input type="hidden" name="reportId" value={report.id} />
          <Button type="submit" variant="ghost" className="text-ink-muted hover:text-danger">
            <Trash2 aria-hidden />
            Delete this draft
          </Button>
        </form>
      ) : null}
    </div>
  );
}
