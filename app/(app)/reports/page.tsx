import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await withClockSkewRetry(() =>
    supabase
      .from("reports")
      .select("id, report_number, report_date, status, projects(name)")
      .order("report_date", { ascending: false })
      .order("report_number", { ascending: false }),
  );

  if (error) {
    throw new Error(`Could not load your reports: ${error.message}`);
  }

  const reports = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Reports</h1>

      {reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="Every report you generate will be listed here, newest first, ready to open or download again."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => {
            const project = Array.isArray(report.projects)
              ? report.projects[0]
              : report.projects;

            return (
              <li key={report.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">
                        Report {formatReportNumber(report.report_number)} ·{" "}
                        {formatDate(report.report_date)}
                      </p>
                      <p className="truncate text-sm text-ink-muted">
                        {project?.name ?? "Unknown project"}
                      </p>
                    </div>
                    <Badge tone={report.status === "final" ? "success" : "neutral"}>
                      {report.status === "final" ? "Final" : "Draft"}
                    </Badge>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
