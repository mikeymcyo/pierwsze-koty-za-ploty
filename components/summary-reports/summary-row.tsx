"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";

import { DeleteSummaryReport } from "@/components/summary-reports/summary-lifecycle";
import { ReportTiming } from "@/components/reports/report-timing";
import { Badge } from "@/components/ui/badge";
import { SwipeButton, SwipeLink, SwipeRow } from "@/components/ui/swipe-row";
import { SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import type { SummaryReportKind } from "@/types/database";
import { formatDate, formatReportNumber } from "@/lib/utils";

export type SummaryReportRowData = {
  id: string;
  kind: SummaryReportKind;
  number: number;
  revision: number;
  title: string | null;
  period_start: string | null;
  period_end: string | null;
  status: "draft" | "final";
  created_at: string;
  finalised_at: string | null;
  projectName: string | null;
};

/**
 * A Progress or Completion Report in a list.
 *
 * Same rules as a Daily Report: a draft is edited, an issued one is opened,
 * reopening stays on the report where its warning is, and Delete is the
 * report's own DeleteSummaryReport with its own wording and typed
 * confirmation. The server still refuses a report another document depends on.
 */
export function SummaryRow({ report }: { report: SummaryReportRowData }) {
  const [confirming, setConfirming] = useState(false);
  const isFinal = report.status === "final";
  const kindLabel = SUMMARY_KIND_LABELS[report.kind];
  const name = report.title || `${kindLabel} ${formatReportNumber(report.number)}`;

  if (confirming) {
    return (
      <DeleteSummaryReport
        reportId={report.id}
        status={report.status}
        label={kindLabel.toLowerCase()}
        defaultOpen
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <SwipeRow
      href={`/summary-reports/${report.id}`}
      label={name}
      actions={(close) => (
        <>
          <SwipeLink
            href={`/summary-reports/${report.id}`}
            icon={isFinal ? <ExternalLink aria-hidden /> : <Pencil aria-hidden />}
          >
            {isFinal ? "Open" : "Edit"}
          </SwipeLink>
          <SwipeButton
            tone="danger"
            icon={<Trash2 aria-hidden />}
            onClick={() => {
              close();
              setConfirming(true);
            }}
          >
            Delete
          </SwipeButton>
        </>
      )}
    >
      <p className="truncate font-semibold text-ink">{name}</p>
      {/* The project is omitted on its own page, where naming it again says
          nothing. The period always earns its line. */}
      <p className="truncate text-sm text-ink-muted">
        {[
          report.projectName,
          report.period_start && report.period_end
            ? `${formatDate(report.period_start)} to ${formatDate(report.period_end)}`
            : "Whole project",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone={isFinal ? "success" : "neutral"}>{isFinal ? "Final" : "Draft"}</Badge>
        {report.revision ? (
          <span className="text-xs font-medium text-ink-subtle">Rev {report.revision}</span>
        ) : null}
        <ReportTiming createdAt={report.created_at} finalisedAt={report.finalised_at} />
      </div>
    </SwipeRow>
  );
}
