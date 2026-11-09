import Link from "next/link";
import { Button } from "@/components/ui/button";

export function FirstReportGuide({ hasActiveSite }: { hasActiveSite: boolean }) {
  return (
    <details open={!hasActiveSite} className="rounded-card border border-line bg-surface px-4">
      <summary className="cursor-pointer py-4 font-semibold text-ink">
        How to make your first Daily report
      </summary>
      <ol className="mb-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-muted">
        <li><strong>Choose a site.</strong> Open an existing project or create one using just the job name.</li>
        <li><strong>Record the work.</strong> Open Site Capture on the project. Type or dictate what happened and add a photo if it helps. For a simple repair, one sentence can be enough.</li>
        <li><strong>Review and share.</strong> Tap Prepare Daily, check the wording and photos, then issue the report when you’re ready to share the PDF. You can return to a draft from Reports.</li>
      </ol>
      {!hasActiveSite && (
        <Button asChild className="mb-4">
          <Link href="/projects/new">Create a project</Link>
        </Button>
      )}
    </details>
  );
}
