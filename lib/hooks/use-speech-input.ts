"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  NOTHING_HEARD_MESSAGE,
  SPEECH_SERVICE_REFUSED_MESSAGE,
  RESTART_REFUSED_MESSAGE,
  decideRestart,
  endSession,
  newSession,
  receive,
  type SpeechEventLike,
  type TranscriptState,
} from "@/lib/speech/transcript";

/**
 * Dictation, expressed as audio-in / text-out.
 *
 * The contract is deliberately narrow - start, stop, and finished text arriving
 * through onText - so the Web Speech API behind it can later be swapped for a
 * Whisper endpoint without any screen that uses it having to change. Nothing
 * here leaks the browser API to callers.
 *
 * iOS Safari **does** implement this - it has exposed webkitSpeechRecognition
 * since 14.5, so `supported` is true on an iPhone and the Dictate button is
 * what a site manager actually uses. An earlier comment here claimed the
 * opposite and the keyboard-microphone fallback it described was never
 * reached.
 *
 * What iOS does not honour is `continuous`. A session ends by itself after a
 * short silence, and is capped well under a minute either way. This hook
 * therefore separates **intent** - the user is dictating - from whether a
 * recognition session happens to be running, and starts a new session whenever
 * one ends while the intent stands. Without that, a pause to look at something
 * ended dictation silently and the rest of the report was spoken into a dead
 * microphone.
 *
 * The accumulation rules and the restart policy are in lib/speech/transcript.ts,
 * where they can be tested without a device.
 */

type SpeechRecognitionErrorEventLike = { error: string };

/** How long to wait for the recogniser's last words after stop is pressed. */
const SETTLE_TIMEOUT_MS = 2500;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

/** Support cannot change during a session, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

export type SpeechInput = {
  /** False until confirmed after mount, so server and client markup agree. */
  supported: boolean;
  listening: boolean;
  /**
   * Stop was pressed and the recogniser has not handed over its last words
   * yet. iOS delivers the final phrase only as the session closes, so until
   * this is false the text is not complete and must not be sent.
   */
  settling: boolean;
  /**
   * What is being heard right now and has not settled. Shown, never stored:
   * on iOS nearly everything said arrives like this until the session ends,
   * and showing nothing until then is how a whole sentence looked lost.
   */
  interim: string;
  /** Set only for faults worth showing; silence is not an error. */
  error: string | null;
  start: () => void;
  stop: () => void;
};

export function useSpeechInput({
  onText,
  lang = "en-GB",
}: {
  onText: (text: string) => void;
  lang?: string;
}): SpeechInput {
  const [listening, setListening] = useState(false);
  const [settling, setSettling] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // What the user asked for, which is not the same as whether a session is
  // running. Every automatic end is measured against this.
  const intentRef = useRef(false);
  const sessionRef = useRef<TranscriptState>(newSession());
  const producedTextRef = useRef(false);
  const emptyEndsRef = useRef(0);
  // Whether anything at all was heard since the person pressed the mic, across
  // every automatic restart. Nothing heard is said so, never passed off as done.
  const heardSinceStartRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Held in a ref so restarting recognition is never needed just because the
  // caller re-rendered with a new closure.
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  // Read through useSyncExternalStore rather than detected in an effect: the
  // server snapshot is false and the client snapshot is the real answer, so the
  // first client render already agrees with the server HTML and there is no
  // hydration mismatch to patch up afterwards. Support never changes at
  // runtime, so the subscribe function has nothing to do.
  const supported = useSyncExternalStore(
    subscribeToNothing,
    () => recognitionConstructor() !== null,
    () => false,
  );

  // Everything the hook owns, torn down in one place. Intent goes first so a
  // session ending during teardown cannot schedule a restart.
  const teardown = useCallback(() => {
    intentRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    // Cleared before aborting: abort fires onend, and that handler must see
    // itself as superseded rather than act on a hook that is going away.
    const abandoned = recognitionRef.current;
    recognitionRef.current = null;
    abandoned?.abort();
  }, []);

  useEffect(() => teardown, [teardown]);

  /** The last words are in (or never will be): the text is complete again. */
  const finishSettling = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setSettling(false);
  }, []);

  // Declared as a ref so onend can start the next session without the two
  // functions having to reference each other before either exists.
  const launchRef = useRef<() => void>(() => {});

  const launch = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = lang;
    // Honoured on desktop, ignored on iOS. Asking for it costs nothing and the
    // restart below covers the platforms that do not give it.
    recognition.continuous = true;
    // On, so the phrase in flight when a session ends is not lost. Only settled
    // text is passed to the caller; the unsettled tail is held by
    // lib/speech/transcript.ts and committed if the session ends without it.
    recognition.interimResults = true;

    // A session's results are numbered from zero, so its accumulator is too.
    sessionRef.current = newSession();
    producedTextRef.current = false;

    // Every handler below belongs to one session. A session that has been
    // superseded - aborted by a fresh start, or torn down - can still deliver
    // one last event, and acting on it would corrupt the accumulator or spawn
    // a recogniser nobody asked for.
    const isCurrent = () => recognitionRef.current === recognition;

    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      const { state, append } = receive(sessionRef.current, event);
      sessionRef.current = state;
      if (append || state.pending) heardSinceStartRef.current = true;
      if (append) {
        producedTextRef.current = true;
        onTextRef.current(append);
      }
      setInterim(state.pending);
    };

    recognition.onerror = (event) => {
      if (!isCurrent()) return;
      // "no-speech" and "aborted" are ordinary - someone paused, or pressed
      // stop. onend follows either way and decides what happens next, so
      // reporting them as failures would train people to ignore errors.
      if (event.error === "no-speech" || event.error === "aborted") return;

      // "not-allowed" is the microphone permission. "service-not-allowed" is
      // the device declining speech recognition for this page - on iPhone
      // that is typically an app opened from the Home Screen, where no
      // setting will change it but the keyboard's own microphone still works.
      setError(
        event.error === "not-allowed"
          ? "Microphone access was blocked. Allow it in your browser settings, or type instead."
          : event.error === "service-not-allowed"
            ? SPEECH_SERVICE_REFUSED_MESSAGE
            : "Dictation stopped unexpectedly. You can keep typing.",
      );
      // A real fault ends the attempt: onend must not restart into it. onend
      // still follows and hands over anything already heard.
      intentRef.current = false;
      setListening(false);
    };

    recognition.onend = () => {
      if (!isCurrent()) return;
      // Whatever never settled is the only copy of those words there is.
      const { append } = endSession(sessionRef.current);
      sessionRef.current = newSession();
      setInterim("");
      if (append) {
        heardSinceStartRef.current = true;
        producedTextRef.current = true;
        onTextRef.current(append);
      }

      // A session that produced nothing is either a long silence or a refusal.
      // Counting them apart is what stops a refusal spinning.
      emptyEndsRef.current = producedTextRef.current ? 0 : emptyEndsRef.current + 1;

      const decision = decideRestart({
        intent: intentRef.current,
        consecutiveEmptyEnds: emptyEndsRef.current,
      });

      if (decision.restart) {
        // Stays visibly listening: from the user's side nothing happened.
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (intentRef.current) launchRef.current();
        }, decision.delayMs);
        return;
      }

      recognitionRef.current = null;
      intentRef.current = false;
      finishSettling();
      setListening(false);
      // "stopped" is the user pressing stop, which needs no explanation -
      // unless nothing at all was heard, which must never pass for a capture.
      if (decision.reason === "exhausted") setError(RESTART_REFUSED_MESSAGE);
      else if (!heardSinceStartRef.current) setError((current) => current ?? NOTHING_HEARD_MESSAGE);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // Thrown when a session is somehow still running, which is harmless -
      // that session is still feeding onresult. Safari refusing outright
      // surfaces as an immediate empty onend instead, and the empty-end
      // counter is what turns a run of those into a visible message.
    }
  }, [lang, finishSettling]);

  useEffect(() => {
    launchRef.current = launch;
  }, [launch]);

  const stop = useCallback(() => {
    // Intent first: onend must see that this end was asked for.
    intentRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const recognition = recognitionRef.current;
    setListening(false);
    if (!recognition) return;

    // stop(), not abort() - abort discards results that have not been
    // delivered. On iOS the last phrase arrives only now, in the final result
    // and onend that follow, so the text is not complete until onend.
    setSettling(true);
    recognition.stop();

    // A session that had already ended (stop pressed in the gap between two
    // automatic sessions) never fires onend again. Whatever it was holding is
    // handed over here instead, so settling can never hang.
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      const { append } = endSession(sessionRef.current);
      sessionRef.current = newSession();
      setInterim("");
      if (append) {
        heardSinceStartRef.current = true;
        onTextRef.current(append);
      }
      setSettling(false);
      if (!heardSinceStartRef.current) setError((current) => current ?? NOTHING_HEARD_MESSAGE);
    }, SETTLE_TIMEOUT_MS);
  }, []);

  const start = useCallback(() => {
    if (!recognitionConstructor()) return;

    // Same reason as teardown: clear first, so the abandoned session's onend
    // cannot schedule a restart against the intent we are about to set.
    const abandoned = recognitionRef.current;
    recognitionRef.current = null;
    abandoned?.abort();

    setError(null);
    finishSettling();
    setInterim("");
    intentRef.current = true;
    emptyEndsRef.current = 0;
    heardSinceStartRef.current = false;
    setListening(true);
    launch();
  }, [launch, finishSettling]);

  return { supported, listening, settling, interim, error, start, stop };
}
