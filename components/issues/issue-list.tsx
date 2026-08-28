import Link from "next/link";
import { Pencil } from "lucide-react";

import { setIssueStatus } from "@/app/(app)/issues/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_PRIORITY_TONES,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_TONES,
  sortIssues,
} from "@/lib/issues/metadata";
import { formatDate } from "@/lib/utils";
import type { Issue } from "@/types/database";

export type IssueRow = Pick<
  Issue,
  "id" | "title" | "description" | "resolution" | "responsible" | "priority" | "status" | "created_at"
>;

/**
 * Issues as a list, with the one action that gets used on site.
 *
 * Moving something from open to in progress is what a site manager actually
 * does with these, and it has to be one tap - a trip to an edit form to change
 * a dropdown is a trip that does not get made, and then the tracker stops
 * matching the site.
 */
export function IssueList({ issues }: { issues: IssueRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {sortIssues(issues).map((issue) => (
        <li key={issue.id}>
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{issue.title}</p>
                  <p className="text-sm text-ink-muted">
                    {[issue.responsible, `Raised ${formatDate(issue.created_at)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge tone={ISSUE_PRIORITY_TONES[issue.priority]}>
                    {ISSUE_PRIORITY_LABELS[issue.priority]}
                  </Badge>
                  <Badge tone={ISSUE_STATUS_TONES[issue.status]}>
                    {ISSUE_STATUS_LABELS[issue.status]}
                  </Badge>
                </div>
              </div>

              {issue.description ? (
                <p className="whitespace-pre-wrap text-sm text-ink">{issue.description}</p>
              ) : null}

              {issue.resolution ? (
                <p className="text-sm text-ink"><span className="font-semibold">Resolution:</span> {issue.resolution}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {ISSUE_STATUSES.filter((option) => option.value !== issue.status).map(
                  (option) =>
                    option.value === "closed" ? (
                      <Button asChild variant="secondary" size="sm" key={option.value}>
                        <Link href={`/issues/${issue.id}`}>Resolve and close</Link>
                      </Button>
                    ) : (
                      <form action={setIssueStatus} key={option.value}>
                        <input type="hidden" name="issueId" value={issue.id} />
                        <input type="hidden" name="status" value={option.value} />
                        <Button type="submit" variant="secondary" size="sm">
                          Mark {option.label.toLowerCase()}
                        </Button>
                      </form>
                    ),
                )}

                <Button asChild variant="ghost" size="sm">
                  <Link href={`/issues/${issue.id}`}>
                    <Pencil aria-hidden />
                    Edit
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
