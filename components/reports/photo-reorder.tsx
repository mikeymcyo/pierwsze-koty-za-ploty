"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ListOrdered } from "lucide-react";

import { Button } from "@/components/ui/button";
import { photoReference } from "@/lib/pdf/photo-evidence";
import {
  PLATES_PER_ROW,
  movePhoto,
  movePhotoEarlier,
  movePhotoLater,
  sharesRow,
} from "@/lib/photos-order";

/**
 * Putting photographs in the order they will print, in one place.
 *
 * The same control on every document: a Daily Report's thumbnail grid and the
 * photographic evidence on a Progress, Completion or Survey report. Two
 * screens with two ways of doing the same job would be two things to learn on
 * a phone, and only one of them would get fixed when something was wrong with
 * it - so the state, the debounce, the gesture and the wording live here and
 * the screens only say where they go.
 *
 * A drag, and a hold before it. The arrows this replaced were reliable and
 * slow: putting plate eleven next to plate two was nine taps. Now a
 * photograph is picked up and put where it goes.
 *
 * The hold is what makes it survivable on a phone. The whole screen is
 * photographs, so every scroll starts on one - a drag that began on contact
 * would make the grid impossible to scroll past. A finger that moves early is
 * scrolling and the gesture is abandoned; a finger that stays still for a
 * fifth of a second has meant it.
 *
 * Keyboard users are not left behind: a tile is focusable while arranging and
 * the arrow keys move it, which is the same operation without the pointer.
 *
 * Nothing here moves, copies or deletes a file. What moves is the link row, so
 * a photograph's caption, status and description go with it.
 */

/** How long a shuffle is left to settle before the order is written. */
const SAVE_DELAY_MS = 700;

export type PhotoOrder = {
  /** The ids in their chosen order, for rendering. */
  ids: string[];
  /** Move one photograph one place, and schedule the save. */
  move: (id: string, direction: "earlier" | "later") => void;
  /** Move it straight to a position - what a drag does - and schedule the save. */
  moveTo: (id: string, index: number) => void;
  pending: boolean;
  saved: boolean;
  error: string | null;
};

/**
 * Holds the order while the screen is open.
 *
 * Re-seeded only when the set of photographs itself changes - one added or
 * removed - so the revalidation that follows a save does not undo the move
 * that caused it.
 */
export function usePhotoOrder(
  incoming: string[],
  save: (ids: string[]) => Promise<{ error?: string }>,
): PhotoOrder {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = [...incoming].sort().join();
  const [order, setOrder] = useState({ key, ids: incoming });
  if (order.key !== key) setOrder({ key, ids: incoming });

  function apply(next: string[]) {
    if (next.join() === order.ids.join()) return;

    setOrder((current) => ({ ...current, ids: next }));
    setSaved(false);
    setError(null);

    // Debounced: somebody moving a plate three places taps three times, and
    // that is one decision rather than three.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const result = await save(next);
        if (result.error) setError(result.error);
        else setSaved(true);
      });
    }, SAVE_DELAY_MS);
  }

  return {
    ids: order.ids,
    move: (id: string, direction: "earlier" | "later") =>
      apply(direction === "earlier" ? movePhotoEarlier(order.ids, id) : movePhotoLater(order.ids, id)),
    // What a drag does: straight to a position, however far away.
    moveTo: (id: string, index: number) => apply(movePhoto(order.ids, id, index)),
    pending,
    saved,
    error,
  };
}

/** The switch into the mode, and whether the last move reached the database. */
export function PhotoOrderBar({
  reordering,
  onToggle,
  order,
}: {
  reordering: boolean;
  onToggle: () => void;
  order: PhotoOrder;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button
        type="button"
        variant={reordering ? "primary" : "secondary"}
        size="sm"
        onClick={onToggle}
        aria-pressed={reordering}
      >
        <ListOrdered aria-hidden />
        {reordering ? "Done" : "Arrange photos"}
      </Button>

      <span aria-live="polite" className="text-xs text-ink-muted">
        {order.error ? (
          <span className="text-danger">{order.error}</span>
        ) : order.pending ? (
          "Saving order…"
        ) : order.saved ? (
          "Order saved"
        ) : null}
      </span>
    </div>
  );
}

/** Said once above the plates, because a rule nobody can see is one they have
 *  to discover by issuing the document. */
export function PhotoOrderHint() {
  return (
    <p className="text-xs text-ink-muted">
      Press and hold a photograph, then drag it where it belongs. The report
      prints {PLATES_PER_ROW} plates to a row in this order, so a before and an
      after placed next to each other appear side by side.
    </p>
  );
}

/**
 * Press and hold a photograph, drag it where it belongs, let go.
 *
 * Returns the props the grid and its tiles need. The rules it enforces are the
 * ones that decide whether this works on a phone at all:
 *
 * - **A hold, not a contact.** More than a few pixels of travel inside the
 *   first fifth of a second means the finger is scrolling, and the gesture is
 *   abandoned to the page.
 * - **`setPointerCapture`**, so the events keep coming to the tile the drag
 *   started on once the finger has left it. Without it a fast drag loses its
 *   target halfway across the grid.
 * - **A native, non-passive `touchmove` listener** to hold the page still.
 *   React registers its own touch listeners passively, so `preventDefault`
 *   inside `onTouchMove` is ignored and the page scrolls out from under the
 *   drag. It is bound only while a drag is actually running.
 * - **`elementFromPoint` on every move**, rather than rectangles measured when
 *   the drag began: the tiles reflow as the order changes under the finger,
 *   and a measurement taken beforehand describes a layout that no longer
 *   exists. The lifted tile stops taking pointer events so the test finds what
 *   is underneath it.
 */
const HOLD_MS = 200;
const SLOP_PX = 10;

export function usePhotoDrag({
  enabled,
  order,
}: {
  enabled: boolean;
  order: PhotoOrder;
}) {
  const [lifted, setLifted] = useState<string | null>(null);
  const gridRef = useRef<HTMLUListElement | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  // Derived rather than cleared in an effect: leaving the mode ends the drag
  // by definition, and a state update chasing a prop is a render nobody needs.
  const dragging = enabled ? lifted : null;

  useEffect(() => {
    const node = gridRef.current;
    if (!dragging || !node) return;
    const hold = (event: TouchEvent) => event.preventDefault();
    node.addEventListener("touchmove", hold, { passive: false });
    return () => node.removeEventListener("touchmove", hold);
  }, [dragging]);

  function cancelHold() {
    if (holdRef.current) clearTimeout(holdRef.current);
    holdRef.current = null;
  }

  function end() {
    cancelHold();
    startRef.current = null;
    setLifted(null);
  }

  function tileFrom(target: EventTarget | null): string | undefined {
    return (target as HTMLElement | null)?.closest<HTMLElement>("[data-photo-id]")?.dataset
      .photoId;
  }

  return {
    dragging,
    /**
     * Spread onto the grid, not onto each tile. One set of listeners for the
     * whole grid: the tile is found from the event, the pointer is captured by
     * the grid so a fast drag cannot outrun it, and no per-tile closure is
     * built during render.
     */
    gridProps: {
      ref: gridRef,
      // Taps and drags, and no double-tap zoom to fight the hold. One-finger
      // scrolling is untouched until a drag actually starts.
      style: enabled ? ({ touchAction: "manipulation" } as const) : undefined,
      onPointerDown: (event: React.PointerEvent) => {
        if (!enabled || event.button !== 0) return;
        const id = tileFrom(event.target);
        if (!id) return;

        startRef.current = { x: event.clientX, y: event.clientY };
        const grid = event.currentTarget as HTMLElement;
        const pointerId = event.pointerId;
        cancelHold();
        holdRef.current = setTimeout(() => {
          setLifted(id);
          try {
            grid.setPointerCapture(pointerId);
          } catch {
            // Safari throws when the pointer has already gone. The drag then
            // does not start, which is the right outcome.
          }
        }, HOLD_MS);
      },
      onPointerMove: (event: React.PointerEvent) => {
        const start = startRef.current;
        if (!start) return;

        if (!dragging) {
          const travelled =
            Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y);
          // Moving already: this is a scroll, and the page can have it.
          if (travelled > SLOP_PX) end();
          return;
        }

        const overId = tileFrom(document.elementFromPoint(event.clientX, event.clientY));
        if (!overId || overId === dragging) return;
        order.moveTo(dragging, order.ids.indexOf(overId));
      },
      onPointerUp: end,
      onPointerCancel: end,
      // The same move without a pointer, for anybody using a keyboard.
      onKeyDown: (event: React.KeyboardEvent) => {
        if (!enabled) return;
        const id = tileFrom(event.target);
        if (!id) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          order.move(id, "earlier");
        } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          order.move(id, "later");
        }
      },
    },
    /** Plain attributes, so nothing is computed from a ref during render. */
    tileProps(id: string, index: number) {
      if (!enabled) return {};
      return {
        "data-photo-id": id,
        tabIndex: 0,
        role: "button" as const,
        "aria-label": `Photograph ${photoReference(index)}. Hold and drag to move it, or use the arrow keys.`,
      };
    },
  };
}

/** What one plate says while it is being arranged. */
export function PhotoOrderCaption({
  index,
  caption,
}: {
  index: number;
  /** Which photograph this is, where two pours of concrete look alike small. */
  caption?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {caption ? <span className="truncate text-[11px] text-ink-muted">{caption}</span> : null}
      {index > 0 && sharesRow(index - 1, index) ? (
        <span className="text-[11px] text-ink-subtle">
          Prints beside {photoReference(index - 1)}
        </span>
      ) : null}
    </div>
  );
}
