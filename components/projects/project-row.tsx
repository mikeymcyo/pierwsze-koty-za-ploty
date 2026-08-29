"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, MoreHorizontal, Pencil, Store, Trash2 } from "lucide-react";

import { deleteProject, type DeleteState } from "@/app/(app)/projects/actions";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { ConfirmAction } from "@/components/ui/confirm-action";
import {
  ACTIONS_WIDTH,
  swipeIntent,
  swipeOffset,
  swipeSettlesOpen,
} from "@/lib/ui/swipe";
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
 * Swipe left to reveal Edit and Delete, the way every other list on the device
 * behaves. The gesture is deliberately hard to trigger by accident - it has to
 * commit clearly to going sideways before the row moves at all, because this
 * list is scrolled far more often than it is swiped - and revealing the
 * actions is never itself destructive: Delete opens the same confirmation as
 * the project's own danger zone, and the word still has to be typed. The
 * server checks it again regardless.
 *
 * The same two actions sit behind a menu button that is always visible, so
 * nothing here depends on knowing the gesture, on having a touchscreen, or on
 * being able to perform a drag at all.
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
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const gesture = useRef<{ x: number; y: number; intent: "undecided" | "horizontal" | "vertical" } | null>(
    null,
  );

  const remove = deleteProject.bind(null, project.id);
  const [state, action] = useActionState<DeleteState, FormData>(remove, {});

  const subtitle = projectSubtitle(project, store);
  const issues = openIssueLabel(openIssues);

  function onPointerDown(event: React.PointerEvent) {
    // Touch only. A mouse drag across a card is somebody selecting text.
    if (event.pointerType !== "touch" || confirming) return;
    gesture.current = { x: event.clientX, y: event.clientY, intent: "undecided" };
  }

  function onPointerMove(event: React.PointerEvent) {
    const start = gesture.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (start.intent === "undecided") {
      start.intent = swipeIntent(dx, dy);
      // A vertical gesture is the list being scrolled. Let go of it entirely.
      if (start.intent === "vertical") {
        gesture.current = null;
        return;
      }
      if (start.intent === "horizontal") {
        setDragging(true);
        // Keep the events coming even when the finger leaves the row, so a
        // fast swipe cannot strand it half open.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    }
    if (start.intent !== "horizontal") return;
    setOffset(swipeOffset(dx, revealed));
  }

  function endGesture() {
    const start = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!start || start.intent !== "horizontal") return;
    const open = swipeSettlesOpen(offset, revealed);
    setRevealed(open);
    setOffset(0);
  }

  if (confirming) {
    return (
      <ConfirmAction
        action={action}
        defaultOpen
        onCancel={() => {
          setConfirming(false);
          setRevealed(false);
        }}
        trigger="Delete"
        title={`Delete ${project.name}?`}
        description="This permanently removes the project and everything recorded against it - every report, photograph, issue and document, including every issued PDF. This cannot be undone."
        confirmLabel="Delete project"
        pendingLabel="Deleting…"
        requireTyping
        error={state.error}
      />
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Behind the card. Present in the markup only while the row is open, so
          nothing reachable by keyboard is hidden underneath a closed row. */}
      {revealed ? (
        <div className="absolute inset-y-0 right-0 flex items-stretch">
          <Link
            href={`/projects/${project.id}/edit`}
            className="flex w-20 flex-col items-center justify-center gap-1 bg-surface-muted text-xs font-semibold text-ink"
          >
            <Pencil className="size-5" aria-hidden />
            Edit
          </Link>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex w-20 flex-col items-center justify-center gap-1 bg-danger text-xs font-semibold text-ink-inverse"
          >
            <Trash2 className="size-5" aria-hidden />
            Delete
          </button>
        </div>
      ) : null}

      <div
        // pan-y tells the browser it keeps vertical scrolling and we handle
        // sideways. Without it iOS claims the gesture before we see it.
        style={{
          touchAction: "pan-y",
          transform: `translateX(${revealed && !dragging ? -ACTIONS_WIDTH : offset}px)`,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className="relative flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm"
      >
        <Link
          href={`/projects/${project.id}`}
          // A tap that ends a swipe must not also open the project.
          onClick={(event) => {
            if (revealed || dragging) {
              event.preventDefault();
              setRevealed(false);
            }
          }}
          className="min-w-0 flex-1"
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
        </Link>

        {/* The gesture is a shortcut, not the only route. */}
        <button
          type="button"
          onClick={() => setRevealed((open) => !open)}
          aria-expanded={revealed}
          aria-label={`Actions for ${project.name}`}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-subtle hover:bg-surface-muted hover:text-ink"
        >
          {revealed ? (
            <ChevronRight className="size-5" aria-hidden />
          ) : (
            <MoreHorizontal className="size-5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
