"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";

import { awardProject } from "@/app/(app)/surveys/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The moment an enquiry becomes a job.
 *
 * One tap rather than a trip through the edit form, because it is the change
 * everything else hangs off: the project starts appearing in active workload
 * and Daily Reports can be written against it. It asks once, because it is not
 * destructive and is reversible from the edit form.
 *
 * Nothing else moves. The survey, its photographs, its documents and any
 * issues it raised are already on this project and stay exactly as they are -
 * which is the whole reason the survey was given a project in the first place.
 */
export function AwardProject({ projectId }: { projectId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <div className="flex flex-col gap-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="button" onClick={() => setConfirming(true)}>
          <CheckCircle2 aria-hidden />
          Work awarded - make this a live project
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-surface-muted p-4">
      <div>
        <p className="font-semibold text-ink">Make this an active project?</p>
        <p className="mt-1 text-sm text-ink-muted">
          It will appear in active projects and on the dashboard, and Daily Reports can be
          written against it. The survey and everything recorded with it stays where it is.
        </p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await awardProject(projectId);
              if (result.error) setError(result.error);
              else setConfirming(false);
            })
          }
        >
          {pending ? "Updating…" : "Make it active"}
        </Button>
      </div>
    </div>
  );
}
