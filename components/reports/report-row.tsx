"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";

import { DeleteReport } from "@/components/reports/report-lifecycle";
import { SwipeButton, SwipeLink, SwipeRow } from "@/components/ui/swipe-row";
import { formatDate, formatReportNumber } from "@/lib/utils";

export type DailyReportRowData = {
  id: string;
  report_number: number;
  report_date: string;
  status: "draft" | "final";
  projectName: string | null;
};

/**
 * A Daily Report in a list, with the actions its state actually allows.
 *
 * A draft is edited; an issued report is opened. Reopening an issued report is
 * deliberately not offered here - it carries its own warning about the PDF a
 * client may already hold, and that belongs on the report itself rather than
 * behind a swipe.
 *
 * Delete is the report's own DeleteReport, unchanged: the same wording, the
 * same typed confirmation for an issued record, and the same server-side
 * checks. Nothing about deletion is reimplemented here.
 */
export function ReportRow({ report }: { report: DailyReportRowData }) {
  const [confirming, setConfirming] = useState(false);
  const isFinal = report.status === "final";

  if (confirming) {
    return (
      <DeleteReport
        reportId={report.id}
        status={report.status}
        defaultOpen
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <SwipeRow
      href={`/reports/${report.id}`}
      label={`Daily Report ${formatReportNumber(report.report_number)}`}
      actions={(close) => (
        <>
          <SwipeLink
            href={`/reports/${report.id}`}
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
      <p className="truncate font-semibold text-ink">
        Daily Report {formatReportNumber(report.report_number)} · {formatDate(report.report_date)}
      </p>
      {/* Omitted on a project's own page, where naming it again says nothing. */}
      {report.projectName ? (
        <p className="truncate text-sm text-ink-muted">{report.projectName}</p>
      ) : null}
      <div className="mt-1.5">
        <Badge tone={isFinal ? "success" : "neutral"}>{isFinal ? "Final" : "Draft"}</Badge>
      </div>
    </SwipeRow>
  );
}
