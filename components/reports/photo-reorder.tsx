"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ListOrdered, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { movePhoto, movePhotoEarlier, movePhotoLater, swapPhotos } from "@/lib/photos-order";

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
 * The gesture itself is not here - it is dnd-kit, in
 * components/reports/photo-arrange.tsx, on a handle rather than the tile.
 * What lives here is what a library has no opinion about: the order while
 * the screen is open, the write the moment it changes, and the switch that
 * opens the arrange view.
 *
 * Nothing here moves, copies or deletes a file. What moves is the link row, so
 * a photograph's caption, status and description go with it.
 */

export type PhotoOrder = {
  /** The ids in their chosen order, for rendering. */
  ids: string[];
  /** Move one photograph one place, and save. */
  move: (id: string, direction: "earlier" | "later") => void;
  /**
   * Put one photograph at a position, shifting the ones between along by one
   * - what a drop does - and save.
   */
  place: (id: string, index: number) => void;
  /** Exchange two photographs and save. Kept for callers that mean a swap. */
  swap: (a: string, b: string) => void;
  /** Send the current order again. The same order twice writes the same rows. */
  retry: () => void;
  pending: boolean;
  saved: boolean;
  error: string | null;
  /**
   * Whether the arrangement on screen is not yet known to be in the database -
   * a save in flight, one queued behind it, or one that failed.
   */
  unsaved: boolean;
};

/**
 * Holds the order while the screen is open, and writes it the moment it
 * changes.
 *
 * No debounce. A drop is a decision, and a person who drops a photograph and
 * then looks at the screen should see "Saving order…" and then "Order saved"
 * rather than nothing for most of a second. Fast repeated moves are coalesced
 * instead: while one save is in flight the latest order waits, and is sent
 * once as soon as the save returns - so ten quick drags cost two writes, and
 * the second carries the order the screen shows.
 *
 * Re-seeded only when the set of photographs itself changes - one added or
 * removed - so the revalidation that follows a save does not undo the move
 * that caused it, and the screen never snaps back.
 */
export function usePhotoOrder(
  incoming: string[],
  save: (ids: string[]) => Promise<{ error?: string }>,
): PhotoOrder {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The order the screen shows, and whether a save is in flight for it.
  const latest = useRef<string[] | null>(null);
  const inFlight = useRef(false);
  const [queued, setQueued] = useState(false);

  const key = [...incoming].sort().join();
  const [order, setOrder] = useState({ key, ids: incoming });
  if (order.key !== key) setOrder({ key, ids: incoming });

  // In flight, queued behind one, or failed: in all three the database does
  // not yet hold what is on the screen.
  const unsaved = queued || pending || error !== null;

  /**
   * Leaving now loses the arrangement.
   *
   * There is no queue behind this - the order is written by a request like any
   * other - so the one honest thing to do about a phone walking away mid-save
   * is to ask first.
   */
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function send(ids: string[]) {
    inFlight.current = true;
    setQueued(false);
    startTransition(async () => {
      const result = await save(ids);
      inFlight.current = false;
      if (result.error) setError(result.error);
      else {
        setError(null);
        setSaved(true);
      }
      // A move landed while this one was travelling: send what the screen
      // shows now, once.
      const next = latest.current;
      if (next && next.join() !== ids.join()) send(next);
    });
  }

  function apply(next: string[]) {
    if (next.join() === order.ids.join()) return;

    setOrder((current) => ({ ...current, ids: next }));
    setSaved(false);
    setError(null);
    latest.current = next;

    if (inFlight.current) setQueued(true);
    else send(next);
  }

  return {
    ids: order.ids,
    move: (id: string, direction: "earlier" | "later") =>
      apply(direction === "earlier" ? movePhotoEarlier(order.ids, id) : movePhotoLater(order.ids, id)),
    place: (id: string, index: number) => apply(movePhoto(order.ids, id, index)),
    swap: (a: string, b: string) => apply(swapPhotos(order.ids, a, b)),
    // Sending the same order again writes the same numbers to the same rows,
    // so a retry is safe however many times it is pressed - and it heals a
    // write that failed part-way through.
    retry: () => send(latest.current ?? order.ids),
    pending,
    saved,
    error,
    unsaved,
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

      <span aria-live="polite" className="flex items-center gap-2 text-xs text-ink-muted">
        {order.error ? (
          <>
            <span className="text-danger">Order not saved. {order.error}</span>
            {/* The same order again, which writes the same numbers to the same
                rows - safe however many times it is pressed. */}
            <Button type="button" variant="secondary" size="sm" onClick={order.retry}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          </>
        ) : order.pending ? (
          "Saving order…"
        ) : order.saved ? (
          "Order saved"
        ) : null}
      </span>
    </div>
  );
}
