"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, GripVertical, ImageOff } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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

import { Button } from "@/components/ui/button";
import { photoReference } from "@/lib/pdf/photo-evidence";
import type { PhotoOrder } from "@/components/reports/photo-reorder";

export type ArrangeablePhoto = {
  id: string;
  url: string | null;
  caption: string | null;
};

/**
 * The arrange view: a screen of nothing but photographs, in the order they
 * will print.
 *
 * ## Why a library
 *
 * The first two attempts at this were written by hand - arrows, then a custom
 * long-press pointer drag - and the second felt wrong on a real iPhone. A
 * photograph that does not visibly leave the grid and follow the finger reads
 * as a broken tap, and the things that fix that are not small: a lifted
 * overlay, neighbours that move aside to show where it will land, auto-scroll
 * when the finger nears an edge, and a delay long enough to tell a drag from a
 * scroll on a screen made entirely of drag targets.
 *
 * dnd-kit does all of that and is maintained. Writing a third custom gesture
 * to avoid 40kB would be the wrong trade in an app whose whole promise is that
 * it works with one hand on site.
 *
 * ## The parts that matter on a phone
 *
 * - **TouchSensor with a delay**, so a swipe scrolls and only a hold picks a
 *   photograph up. `touch-action: manipulation` lets that scroll through.
 * - **DragOverlay**, so the thing under the finger is a real lifted tile
 *   rather than a hole in the grid.
 * - **Auto-scroll** is dnd-kit's own, and works because this view owns its
 *   scroll container.
 * - **A dedicated view.** Captions, delete buttons and the AI have nothing to
 *   do with sequence, and a full screen of photographs is what somebody
 *   reordering fifteen plates actually needs.
 *
 * Order is sequence and nothing else. It decides which plate is P01 and which
 * is P07; it does not decide how many plates the PDF puts on a row, and the
 * screen no longer says otherwise.
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
    // MouseSensor and TouchSensor rather than the one PointerSensor that
    // covers both. A pointer sensor also receives touch, so it claims the
    // gesture before the hold below can be judged - which on a phone meant a
    // press-and-hold did nothing at all and a swipe started a drag the browser
    // then cancelled. Two sensors, one rule each:
    //
    // a mouse drags as soon as it has travelled a little, and a finger has to
    // hold still first, because on this screen every scroll starts on a
    // photograph.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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
    // The index it was dropped on is where it goes. usePhotoOrder holds the
    // order and debounces the write, exactly as it did for the arrows.
    order.moveTo(String(active.id), order.ids.indexOf(String(over.id)));
  }

  // Never server-rendered - it only exists once somebody has pressed Arrange -
  // but portalling needs a document either way.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
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
        <Button type="button" onClick={onDone}>
          <Check aria-hidden />
          Done
        </Button>
      </header>

      <p className="px-4 pt-3 text-sm text-ink-muted">
        Press and hold a photograph, then drag it into place. They are numbered
        and printed in this order.
      </p>

      {/* This view owns its scrolling, which is what lets dnd-kit scroll it
          automatically when a drag reaches the top or the bottom. */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setLifted(null)}
        >
          <SortableContext items={order.ids} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ordered.map((photo, index) => (
                <ArrangeTile key={photo.id} photo={photo} index={index} />
              ))}
            </ul>
          </SortableContext>

          {/* What the finger is actually holding. */}
          <DragOverlay modifiers={[restrictToWindowEdges]}>
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
        />
      ) : (
        <div className="grid size-full place-items-center text-ink-subtle">
          <ImageOff className="size-6" aria-hidden />
        </div>
      )}
    </div>
  );
}

function ArrangeTile({ photo, index }: { photo: ArrangeablePhoto; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Scrolling still works: the touch sensor's delay lets a swipe through
        // and only takes the gesture once a finger has held still.
        touchAction: "manipulation",
        // The gap left behind is the insertion point, and the neighbours
        // sliding around it are what show where the photograph will land.
        opacity: isDragging ? 0.35 : 1,
      }}
      {...attributes}
      {...listeners}
      className="flex cursor-grab flex-col gap-1 rounded-xl border border-line bg-surface p-1 select-none active:cursor-grabbing"
    >
      <Thumbnail photo={photo} />
      <div className="flex items-center justify-between gap-1 px-1 pb-0.5">
        <span className="font-mono text-xs font-semibold tabular-nums text-ink">
          {photoReference(index)}
        </span>
        <GripVertical className="size-4 shrink-0 text-ink-subtle" aria-hidden />
      </div>
      {photo.caption ? (
        <span className="truncate px-1 pb-1 text-[11px] text-ink-muted">{photo.caption}</span>
      ) : null}
    </li>
  );
}
