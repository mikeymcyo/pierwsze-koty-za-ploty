/**
 * The arithmetic behind a swipe-to-reveal row.
 *
 * Pure, with no runtime imports and no path aliases, so the thresholds can be
 * tested without a touchscreen.
 *
 * A list on site is scrolled far more often than it is swiped, so the rules
 * lean hard towards scrolling: a gesture is only treated as horizontal once it
 * has clearly committed to going sideways, and a half-hearted swipe springs
 * back rather than leaving a row hanging open beside a delete button.
 */

/** How far a row slides to show its actions. Two 44pt targets plus padding. */
export const ACTIONS_WIDTH = 164;

/** Movement before a gesture counts as anything at all. */
export const INTENT_THRESHOLD = 10;

/** How far a row must be dragged before releasing leaves it open. */
export const OPEN_THRESHOLD = 56;

export type SwipeIntent = "undecided" | "horizontal" | "vertical";

/**
 * What the finger is doing.
 *
 * Vertical wins ties and near-ties: mistaking a scroll for a swipe stops the
 * list dead under somebody's thumb, while mistaking a swipe for a scroll costs
 * them one more try. The 1.4 factor is what keeps a slightly diagonal flick
 * down the page from opening a row.
 */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);
  if (horizontal < INTENT_THRESHOLD && vertical < INTENT_THRESHOLD) return "undecided";
  return horizontal > vertical * 1.4 ? "horizontal" : "vertical";
}

/**
 * Where the row sits while a finger is on it.
 *
 * Negative is leftwards. Dragging further than the actions are wide does
 * nothing, and dragging right from closed does nothing either - there is
 * nothing on that side to reveal.
 */
export function swipeOffset(dx: number, wasOpen: boolean): number {
  const base = wasOpen ? -ACTIONS_WIDTH : 0;
  return Math.max(-ACTIONS_WIDTH, Math.min(0, base + dx));
}

/**
 * Whether the row stays open once the finger lifts.
 *
 * Measured from where it started rather than from zero, so a small nudge on an
 * already open row does not slam it shut, and a small nudge on a closed one
 * does not leave a delete button exposed.
 */
export function swipeSettlesOpen(offset: number, wasOpen: boolean): boolean {
  return wasOpen ? offset < -(ACTIONS_WIDTH - OPEN_THRESHOLD) : offset < -OPEN_THRESHOLD;
}
