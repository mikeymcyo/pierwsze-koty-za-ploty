"use client";

import { useRef, useState, useTransition } from "react";
import { ListOrdered } from "lucide-react";

import { Button } from "@/components/ui/button";
import { movePhotoEarlier, movePhotoLater, swapPhotos } from "@/lib/photos-order";

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
 * The gesture itself is not here. Two versions of it were written by hand -
 * arrows, then a custom long-press pointer drag - and the second felt wrong on
 * a real iPhone, so it was replaced by dnd-kit in
 * components/reports/photo-arrange.tsx. What stayed behind is what a library
 * has no opinion about: the order while the screen is open, the debounce
 * before it is written, and the switch that opens the arrange view.
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
  /**
   * Exchange two photographs - what a drag does - and schedule the save.
   *
   * A swap rather than an insertion: dropping one plate onto another changes
   * those two numbers and leaves every other photograph exactly where it was.
   */
  swap: (a: string, b: string) => void;
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
    // What a drag does: the two exchange places, and nothing else moves.
    swap: (a: string, b: string) => apply(swapPhotos(order.ids, a, b)),
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
