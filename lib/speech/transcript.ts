/**
 * Transcript accumulation and restart policy for dictation.
 *
 * Pure, with no runtime imports and no path aliases, so it loads straight into
 * Node and the awkward cases can be tested without a device. The browser
 * plumbing - creating a recogniser, wiring events, timers - stays in
 * lib/hooks/use-speech-input.ts.
 *
 * ## The problem this solves
 *
 * On iOS Safari `continuous = true` is not honoured the way it is on desktop:
 * the recogniser ends by itself after a short silence, and caps a session well
 * under a minute. The first version of this feature simply set `listening` to
 * false when that happened, so a site manager who paused to look at something
 * carried on talking into a microphone that had stopped. Thirty seconds of
 * dictation arrived as two sentences.
 *
 * Recovering from that means restarting, and restarting means two hazards this
 * module exists to handle: `event.results` starts again at index 0 in the new
 * session, so a naive appender re-appends everything it already has; and the
 * phrase in flight when a session ends never reaches `isFinal`, so it is lost
 * unless it is kept deliberately.
 */

export type SpeechResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

export type SpeechEventLike = {
  results: { length: number; [index: number]: SpeechResultLike };
};

/**
 * What has been taken from the current recognition session.
 *
 * `committed` counts final results already handed to the caller, and is the
 * watermark that makes a re-delivered results array harmless. `pending` is the
 * latest text that has not settled yet - kept so that a session ending mid
 * phrase does not throw that phrase away.
 */
export type TranscriptState = {
  committed: number;
  pending: string;
};

/** A session's results start again at index 0, so its state must start fresh too. */
export function newSession(): TranscriptState {
  return { committed: 0, pending: "" };
}

/**
 * Takes one recognition event and reports the text that is newly settled.
 *
 * The whole results array is read rather than the slice from `resultIndex`:
 * engines differ on whether that index means "new since last event" or is
 * simply zero every time, and counting finals against a watermark is correct
 * under both readings. Anything already handed over is never handed over twice.
 */
export function receive(
  state: TranscriptState,
  event: SpeechEventLike,
): { state: TranscriptState; append: string } {
  const finals: string[] = [];
  let pending = "";

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (!result) continue;
    const transcript = result[0]?.transcript ?? "";
    if (result.isFinal) {
      finals.push(transcript);
    } else {
      pending += transcript;
    }
  }

  const append = finals.slice(state.committed).join(" ").trim();
  return {
    state: { committed: finals.length, pending: pending.trim() },
    append,
  };
}

/**
 * Closes a session, returning the tail that never settled.
 *
 * When Safari ends a session cleanly the last phrase usually arrives as a final
 * first, leaving nothing pending and nothing to append here. When it does not -
 * a cut-off mid sentence - this is the only copy of those words that exists.
 */
export function endSession(state: TranscriptState): {
  state: TranscriptState;
  append: string;
} {
  return { state: newSession(), append: state.pending.trim() };
}

/**
 * How many restarts to attempt while nothing at all is being recognised.
 *
 * A session that ends empty is either a long silence, which is worth waiting
 * through, or a refusal - a microphone permission withdrawn, or Safari
 * declining to start again outside a user gesture. Three attempts tell those
 * apart without spinning: a refusal fails immediately every time, a person
 * thinking about what to say next does not. Any recognised text resets the
 * count, so a talkative half hour never exhausts it.
 */
export const MAX_EMPTY_RESTARTS = 3;

/** Rising, so a genuine refusal is not retried in a tight loop. */
export const RESTART_DELAYS_MS = [150, 500, 1200];

export type RestartDecision =
  | { restart: true; delayMs: number }
  | { restart: false; reason: "stopped" | "exhausted" };

/**
 * Whether to start another session when the current one ends.
 *
 * `intent` is what the user asked for, not what the recogniser is doing: it
 * stays true across every automatic end and goes false only when they press
 * stop. That distinction is the whole fix - an end that the user did not ask
 * for is an interruption to recover from, not a result.
 */
export function decideRestart({
  intent,
  consecutiveEmptyEnds,
}: {
  intent: boolean;
  consecutiveEmptyEnds: number;
}): RestartDecision {
  if (!intent) return { restart: false, reason: "stopped" };

  // Counted after the end that prompted this, so the first empty end arrives
  // here as 1 and must still be allowed to restart.
  if (consecutiveEmptyEnds > MAX_EMPTY_RESTARTS) {
    return { restart: false, reason: "exhausted" };
  }

  const delayMs =
    RESTART_DELAYS_MS[
      Math.min(Math.max(consecutiveEmptyEnds - 1, 0), RESTART_DELAYS_MS.length - 1)
    ];
  return { restart: true, delayMs };
}

/** Shown when dictation cannot carry on by itself. Never leave a stop invisible. */
export const RESTART_REFUSED_MESSAGE = "Dictation stopped - tap Dictate to continue.";

/** Joins a new chunk onto what the field already holds, without doubling spaces. */
export function joinTranscript(current: string, chunk: string): string {
  const existing = current.trim();
  const addition = chunk.trim();
  if (!addition) return current;
  if (!existing) return addition;
  return `${existing} ${addition}`;
}
