import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { hasExtractionConfig } from "@/lib/ai/document-extraction";
import { runExtractionCheck } from "@/lib/documents/extraction-check";

/**
 * TEMPORARY. Delete this page once the live extraction has been validated.
 *
 * It exists to answer one question that cannot be answered from a terminal
 * without the OpenAI key, and the key is deliberately only in Vercel: does the
 * model quote documents verbatim well enough to survive the check?
 *
 * So the check runs where the key already is. Nothing is exposed - the report
 * is rendered to a signed-in member of a company and the key never leaves the
 * server, exactly as it does not for any other AI feature.
 *
 * WHAT IT TOUCHES: nothing. The purchase order is built in memory, the reading
 * is rendered and thrown away, and no project, document, extraction row or
 * storage object is read or written. Loading it twice changes nothing either
 * time. It cannot reach live data because it never asks for any.
 *
 * PROTECTION:
 *  - it is under (app), whose layout calls requireSessionContext, so an
 *    anonymous request is redirected to the login before this file runs;
 *  - it 404s in production, so it cannot be reached on the live deployment
 *    even by somebody signed in.
 */

// One model call on a two-page document. Vercel's default function timeout is
// shorter than that call, so without this the page returns a platform timeout
// rather than a report - which would look exactly like the model hanging.
export const maxDuration = 60;

export default async function ExtractionCheckPage() {
  // Preview and local only. Production has no business running this, and the
  // check is the same either way because the key is the same key.
  if (process.env.VERCEL_ENV === "production") notFound();

  if (!hasExtractionConfig()) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Live extraction check" />
        <Card>
          <CardContent>
            <p className="text-sm text-ink">
              No OPENAI_API_KEY is set on this deployment, so nothing was called. Set it under
              Settings &rarr; Environments for this environment and reload.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const report = await runExtractionCheck();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Live extraction check"
        description="One real model call against a purchase order built in memory. Nothing is saved."
      />
      <Card>
        <CardContent>
          <p className="text-sm text-ink-muted">
            {report.ok ? "The reading succeeded." : "The reading failed - the report says why."}{" "}
            Model {report.stats.model}, {(report.stats.elapsedMs / 1000).toFixed(1)}s, {report.stats.kept}{" "}
            kept, {report.stats.dropped} dropped, {report.stats.relocated} page corrected.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {/* Selectable and wrapped, so the whole thing can be copied off a
              phone without a horizontal scrollbar swallowing half of it. */}
          <pre className="max-w-full text-xs leading-relaxed break-words whitespace-pre-wrap text-ink">
            {report.text}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
