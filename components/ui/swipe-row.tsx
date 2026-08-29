"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal } from "lucide-react";

import {
  ACTIONS_WIDTH,
  swipeIntent,
  swipeOffset,
  swipeSettlesOpen,
} from "@/lib/ui/swipe";

/**
 * A list row whose actions are a swipe away, and a tap away as well.
 *
 * The gesture is deliberately hard to have by accident: it must commit clearly
 * to going sideways before the row moves at all - vertical wins ties, because
 * a list that sticks under somebody's thumb is worse than a swipe they have to
 * try twice - the pointer is captured so a fast swipe cannot strand a row half
 * open, and a mouse drag across a card is somebody selecting text.
 *
 * Revealing actions is never itself destructive. What the actions do is the
 * caller's business, and a destructive one is expected to put its own
 * confirmation in the row's place rather than acting on the tap.
 *
 * The same actions sit behind a menu button that is always visible, so nothing
 * depends on knowing the gesture, on having a touchscreen, or on being able to
 * perform a drag at all. The actions are absent from the markup while the row
 * is closed, so nothing reachable by keyboard hides underneath it.
 *
 * The arithmetic lives in lib/ui/swipe.ts and is tested there.
 */
export function SwipeRow({
  href,
  label,
  actions,
  children,
}: {
  /** Where the row itself goes. */
  href: string;
  /** Names the row for the menu button's label. */
  label: string;
  /** Rendered behind the row. Given `close` so an action can tidy up after itself. */
  actions: (close: () => void) => ReactNode;
  children: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    intent: "undecided" | "horizontal" | "vertical";
  } | null>(null);

  function onPointerDown(event: React.PointerEvent) {
    // Touch only. A mouse drag across a card is somebody selecting text.
    if (event.pointerType !== "touch") return;
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
    setRevealed(swipeSettlesOpen(offset, revealed));
    setOffset(0);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {revealed ? (
        <div className="absolute inset-y-0 right-0 flex items-stretch">
          {actions(() => setRevealed(false))}
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
          href={href}
          // A tap that ends a swipe must not also open the row.
          onClick={(event) => {
            if (revealed || dragging) {
              event.preventDefault();
              setRevealed(false);
            }
          }}
          className="min-w-0 flex-1"
        >
          {children}
        </Link>

        {/* The gesture is a shortcut, not the only route. */}
        <button
          type="button"
          onClick={() => setRevealed((open) => !open)}
          aria-expanded={revealed}
          aria-label={`Actions for ${label}`}
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

/** One revealed action: a link, styled to match its sibling button. */
export function SwipeLink({
  href,
  icon,
  children,
  tone = "neutral",
}: {
  href: string;
  icon: ReactNode;
  children: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <Link href={href} className={swipeActionClass(tone)}>
      {icon}
      {children}
    </Link>
  );
}

/** One revealed action that does something rather than going somewhere. */
export function SwipeButton({
  onClick,
  icon,
  children,
  tone = "neutral",
}: {
  onClick: () => void;
  icon: ReactNode;
  children: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <button type="button" onClick={onClick} className={swipeActionClass(tone)}>
      {icon}
      {children}
    </button>
  );
}

function swipeActionClass(tone: "neutral" | "danger"): string {
  return [
    "flex w-20 flex-col items-center justify-center gap-1 text-xs font-semibold [&_svg]:size-5",
    tone === "danger" ? "bg-danger-strong text-white" : "bg-surface-muted text-ink",
  ].join(" ");
}
