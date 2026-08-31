"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ListOrdered } from "lucide-react";

import { Button } from "@/components/ui/button";
import { photoReference } from "@/lib/pdf/photo-evidence";
import { PLATES_PER_ROW, movePhotoEarlier, movePhotoLater, sharesRow } from "@/lib/photos-order";

/**
 * Putting photographs in the order they will print, in one place.
 *
 * The same control on every document: a Daily Report's thumbnail grid and the
 * photographic evidence on a Progress, Completion or Survey report. Two
 * screens with two ways of doing the same job would be two things to learn on
 * a phone, and only one of them would get fixed when something was wrong with
 * it - so the state, the debounce, the arrows and the wording live here and
 * the screens only say where they go.
 *
 * Arrows rather than a drag. A long-press drag on iOS fights the page's own
 * scrolling, and a report with fifteen photographs is a lot of dragging on a
 * phone held in one hand with the other on a ladder. Two big targets move a
 * plate one place at a time and can be tapped without looking.
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

  function move(id: string, direction: "earlier" | "later") {
    const next =
      direction === "earlier" ? movePhotoEarlier(order.ids, id) : movePhotoLater(order.ids, id);
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

  return { ids: order.ids, move, pending, saved, error };
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
        {reordering ? "Done reordering" : "Reorder"}
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
      The report prints {PLATES_PER_ROW} plates to a row in this order, so a before and
      an after placed next to each other appear side by side.
    </p>
  );
}

/** The two arrows under one plate, and what it will sit beside. */
export function PhotoOrderArrows({
  index,
  count,
  onMove,
  caption,
}: {
  index: number;
  count: number;
  onMove: (direction: "earlier" | "later") => void;
  /** Which photograph this is, where two pours of concrete look alike small. */
  caption?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="flex-1"
          disabled={index === 0}
          aria-label={`Move ${photoReference(index)} earlier`}
          onClick={() => onMove("earlier")}
        >
          <ArrowLeft aria-hidden />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="flex-1"
          disabled={index === count - 1}
          aria-label={`Move ${photoReference(index)} later`}
          onClick={() => onMove("later")}
        >
          <ArrowRight aria-hidden />
        </Button>
      </div>
      {caption ? (
        <span className="truncate text-[11px] text-ink-muted">{caption}</span>
      ) : null}
      {index > 0 && sharesRow(index - 1, index) ? (
        <span className="text-[11px] text-ink-subtle">
          Prints beside {photoReference(index - 1)}
        </span>
      ) : null}
    </div>
  );
}
