import Link from "next/link";
import { Mic, FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  continueCaptureHref,
  describeCaptureProgress,
  describeLastUpdated,
  projectHref,
  type DraftDaily,
} from "@/lib/reports/continuity";
import { formatDate, formatReportNumber } from "@/lib/utils";

/**
 * The Daily Report somebody is part-way through, offered before anything else.
 *
 * One card, on the store page and on the dashboard, so the answer to "what was
 * I doing here?" looks the same wherever it is met. Continue goes straight at
 * the report by its own id - never through an action that could create one -
 * so every word already captured is still there when it opens.
 */
export function CaptureInProgress({
  draft,
  where,
}: {
  draft: DraftDaily;
  /** The store or project this is being shown against, for the second line. */
  where?: string | null;
}) {
  return (
    <Card className="border-brand bg-brand-soft">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface ring-1 ring-brand/30">
            <Mic className="size-5 text-brand" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Site Capture in progress</p>
            <p className="truncate text-sm text-ink-muted">
              {[draft.projectName, where].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              Report {formatReportNumber(draft.reportNumber)} ·{" "}
              {formatDate(draft.reportDate) ?? draft.reportDate} ·{" "}
              {describeCaptureProgress(draft)} · {describeLastUpdated(draft.updatedAt)}
            </p>
          </div>
        </div>

        {/* Continue first and full width on a phone: it is what somebody
            standing at the store came here to do. */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="sm:flex-1">
            <Link href={continueCaptureHref(draft)}>
              <Mic aria-hidden />
              Continue Site Capture
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="sm:flex-1">
            <Link href={projectHref({ id: draft.projectId })}>
              <FolderOpen aria-hidden />
              Open project
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
