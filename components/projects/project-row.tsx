"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Store, Trash2 } from "lucide-react";

import { DeleteProject } from "@/components/projects/project-delete";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { SwipeButton, SwipeLink, SwipeRow } from "@/components/ui/swipe-row";
import { openIssueLabel, projectSubtitle } from "@/lib/projects/row-summary";
import type { ProjectStatus } from "@/types/database";

export type ProjectRowProject = {
  id: string;
  name: string;
  client: string | null;
  site_address: string | null;
  project_reference: string | null;
  status: ProjectStatus;
};

export type ProjectRowStore = { displayName: string; displayCode: string } | null;

/**
 * A project in the list, with the two actions that are otherwise three taps
 * away.
 *
 * The gesture, the menu fallback and the rule that revealing actions is never
 * destructive all live in SwipeRow. Delete here is the project's own
 * DeleteProject - the same wording, the same typed confirmation, and the same
 * server-side check. Nothing about deletion is reimplemented.
 */
export function ProjectRow({
  project,
  store,
  openIssues,
}: {
  project: ProjectRowProject;
  store: ProjectRowStore;
  openIssues: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const subtitle = projectSubtitle(project, store);
  const issues = openIssueLabel(openIssues);

  if (confirming) {
    return (
      <DeleteProject
        projectId={project.id}
        projectName={project.name}
        defaultOpen
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <SwipeRow
      href={`/projects/${project.id}`}
      label={project.name}
      actions={(close) => (
        <>
          <SwipeLink href={`/projects/${project.id}/edit`} icon={<Pencil aria-hidden />}>
            Edit
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
      <p className="truncate font-semibold text-ink">{project.name}</p>
      {subtitle ? (
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink-muted">
          {store ? <Store className="size-3.5 shrink-0" aria-hidden /> : null}
          <span className="truncate">{subtitle}</span>
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ProjectStatusBadge status={project.status} />
        {issues ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-warning">
            <AlertTriangle className="size-3.5" aria-hidden />
            {issues}
          </span>
        ) : null}
        {project.project_reference ? (
          <span className="text-xs font-medium text-ink-subtle">
            Ref {project.project_reference}
          </span>
        ) : null}
      </div>
    </SwipeRow>
  );
}
