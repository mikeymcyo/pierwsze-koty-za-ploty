"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImageOff,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { rotatePhoto, type PhotoRotationState } from "@/app/(app)/reports/photo-actions";
import { Button } from "@/components/ui/button";
import { photoReference } from "@/lib/pdf/photo-evidence";
import { cssRotation, isQuarterTurn } from "@/lib/photos-rotation";
import type { PhotoOrder } from "@/components/reports/photo-reorder";

export type ArrangeablePhoto = {
  id: string;
  url: string | null;
  caption: string | null;
  /** Quarter turns applied while drawing. Absent means as uploaded. */
  rotation?: number | null;
};

/**
 * The arrange view: a screen of nothing but photographs, in the order they
 * will print.
 *
 * ## The gesture, third time
 *
 * The last version made every tile the thing you drag, after a 200 ms hold,
 * with the browser still allowed to pan. On a real iPhone that is a fight:
 * a finger that drifts eight pixels during the hold cancels the lift and
 * reads as a dead tap, and a finger that holds still and then moves has
 * Safari panning the page underneath the drag, so the tile stutters and the
 * drop lands somewhere else. A screen made entirely of drag targets cannot
 * also be a screen that scrolls.
 *
 * So the tile is not draggable. A handle is - the grip on each tile, with
 * `touch-action: none` on the handle alone - and it lifts the moment the
 * finger moves, no hold. Everywhere else on the screen is ordinary scrolling
 * that nothing intercepts.
 *
 * ## What the finger sees
 *
 * A sortable grid: the lifted photograph follows the finger as an overlay,
 * its own slot stays behind as a dashed placeholder, and the placeholder
 * moves through the grid as the neighbours shift to make room, so the drop
 * position is never in doubt. Near the top or bottom the view scrolls itself.
 * Dropping writes the order at once - no debounce - and the screen keeps the
 * order it shows; a save that fails says so and offers to try again.
 *
 * An insertion, not a swap. Dropping P05 where P02 is makes it P02 and moves
 * P02-P04 along by one - what "put that one there" means on a page of plates
 * - and the arrows under a tile do the same one place at a time, for anyone
 * who would rather not drag at all.
 *
 * Order is sequence and nothing else. It decides which plate is P01 and which
 * is P07; it does not decide how many plates the PDF puts on a row.
 */
export function PhotoArrangeView({
  photos,
  order,
  onDone,
  title = "Arrange photos",
}: {
  photos: ArrangeablePhoto[];
  order: PhotoOrder;
  onDone: () => void;
  title?: string;
}) {
  const [lifted, setLifted] = useState<string | null>(null);

  // Escape leaves, the same as Done.
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onDone]);

  const sensors = useSensors(
    // One sensor for mouse, pen and finger alike. It only ever hears the
    // handle, and the handle refuses the browser's own panning, so a few
    // pixels of travel is all it takes to know this is a drag and not a
    // scroll - no hold, and nothing for a scroll to cancel.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const ordered = order.ids.flatMap((id) => {
    const photo = byId.get(id);
    return photo ? [photo] : [];
  });
  const liftedPhoto = lifted ? byId.get(lifted) : null;

  function onDragStart(event: DragStartEvent) {
    setLifted(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setLifted(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Where the placeholder was when the finger let go is where it lands.
    // usePhotoOrder holds the order and writes it straight away.
    order.place(String(active.id), order.ids.indexOf(String(over.id)));
  }

  // Never server-rendered - it only exists once somebody has pressed Arrange -
  // but portalling needs a document either way.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <div className="flex flex-col">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <span aria-live="polite" className="text-xs text-ink-muted">
            {order.error ? (
              <span className="text-danger">{order.error}</span>
            ) : order.pending ? (
              "Saving order…"
            ) : order.saved ? (
              "Order saved"
            ) : (
              `${ordered.length} photograph${ordered.length === 1 ? "" : "s"}`
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {order.error ? (
            <Button type="button" variant="secondary" size="sm" onClick={order.retry}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          ) : null}
          <Button type="button" onClick={onDone}>
            <Check aria-hidden />
            Done
          </Button>
        </div>
      </header>

      <p className="px-4 pt-3 text-sm text-ink-muted">
        Drag a photograph by its grip to where it should print. The others make room. The
        arrows move it one place; the order is saved as you go.
      </p>

      {/* This view owns its scrolling, which is what lets dnd-kit scroll it
          itself when a drag reaches the top or the bottom. */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setLifted(null)}
          autoScroll={{ threshold: { x: 0, y: 0.2 } }}
        >
          <SortableContext items={order.ids} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ordered.map((photo, index) => (
                <ArrangeTile
                  key={photo.id}
                  photo={photo}
                  index={index}
                  count={ordered.length}
                  order={order}
                />
              ))}
            </ul>
          </SortableContext>

          {/* What the finger is actually holding. */}
          <DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={null}>
            {liftedPhoto ? (
              <div className="rounded-xl border-2 border-brand bg-surface p-1 shadow-2xl">
                <Thumbnail photo={liftedPhoto} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>,
    document.body,
  );
}

function Thumbnail({ photo }: { photo: ArrangeablePhoto }) {
  const turn = cssRotation(photo.rotation);
  return (
    <div className="aspect-square overflow-hidden rounded-lg bg-surface-muted">
      {photo.url ? (
        // Signed Supabase URLs expire, so next/image's optimiser would cache a
        // URL that outlives it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt={photo.caption ?? "Site photograph"}
          className="size-full object-cover"
          draggable={false}
          style={
            turn
              ? {
                  transform: turn,
                  // On its side the photograph's long edge runs down the box,
                  // so it is drawn against the box's other dimension before
                  // being turned - otherwise a quarter turn leaves bars.
                  width: isQuarterTurn(photo.rotation) ? "100%" : undefined,
                  height: isQuarterTurn(photo.rotation) ? "100%" : undefined,
                }
              : undefined
          }
        />
      ) : (
        <div className="grid size-full place-items-center text-ink-subtle">
          <ImageOff className="size-6" aria-hidden />
        </div>
      )}
    </div>
  );
}

/** Turn this photograph a quarter of the way round. */
function RotateButton({
  photoId,
  direction,
}: {
  photoId: string;
  direction: "left" | "right";
}) {
  const turn = rotatePhoto.bind(null, photoId);
  const [state, action] = useActionState<PhotoRotationState, FormData>(turn, {});
  const Icon = direction === "left" ? RotateCcw : RotateCw;

  return (
    <form action={action}>
      <input type="hidden" name="direction" value={direction} />
      <Button
        type="submit"
        variant="secondary"
        size="icon"
        // A finger, not a cursor: the same target the rest of the app uses.
        className="size-10"
        aria-label={`Rotate ${direction} 90 degrees`}
        title={state.error ?? `Rotate ${direction} - the file itself is never altered`}
      >
        <Icon aria-hidden />
      </Button>
    </form>
  );
}

function ArrangeTile({
  photo,
  index,
  count,
  order,
}: {
  photo: ArrangeablePhoto;
  index: number;
  count: number;
  order: PhotoOrder;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={[
        "flex flex-col gap-1 rounded-xl border-2 bg-surface p-1 select-none",
        // The slot it came from, held open while it travels: the placeholder
        // moves through the grid as the neighbours make room, and where it
        // is when the finger lets go is where the photograph lands.
        isDragging ? "border-dashed border-brand bg-brand/10 opacity-40" : "border-line",
      ].join(" ")}
    >
      <Thumbnail photo={photo} />

      <div className="flex items-center justify-between gap-1 px-1">
        <span className="font-mono text-xs font-semibold tabular-nums text-ink">
          {photoReference(index)}
        </span>
        {/* The handle. The only thing on this screen that starts a drag, and
            the only thing that tells the browser not to scroll - so the rest
            of the tile, and the whole screen around it, scrolls as normal. */}
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to move ${photoReference(index)}`}
          data-photo-handle={photo.id}
          className="grid size-11 shrink-0 cursor-grab place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink active:cursor-grabbing"
          style={{ touchAction: "none" }}
        >
          <GripVertical className="size-5" aria-hidden />
        </button>
      </div>

      {/* One place at a time, for anyone who would rather not drag. Left
          means earlier in the report, right means later. */}
      <div className="flex items-center justify-between gap-1 px-1 pb-1">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-10"
            aria-label={`Move ${photoReference(index)} earlier`}
            disabled={index === 0}
            onClick={() => order.move(photo.id, "earlier")}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-10"
            aria-label={`Move ${photoReference(index)} later`}
            disabled={index === count - 1}
            onClick={() => order.move(photo.id, "later")}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <RotateButton photoId={photo.id} direction="left" />
          <RotateButton photoId={photo.id} direction="right" />
        </div>
      </div>

      {photo.caption ? (
        <span className="truncate px-1 pb-1 text-[11px] text-ink-muted">{photo.caption}</span>
      ) : null}
    </li>
  );
}
