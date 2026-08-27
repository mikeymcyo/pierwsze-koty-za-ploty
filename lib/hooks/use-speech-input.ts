"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Dictation, expressed as audio-in / text-out.
 *
 * The contract is deliberately narrow - start, stop, and finished text arriving
 * through onText - so the Web Speech API behind it can later be swapped for a
 * Whisper endpoint without any screen that uses it having to change. Nothing
 * here leaks the browser API to callers.
 *
 * Support is genuinely patchy. iOS Safari in particular does not implement it
 * usefully, so `supported` is false there and the UI is expected to fall back to
 * the keyboard microphone, which types into the same field and works fine.
 */

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechRecognitionErrorEventLike = { error: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
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
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

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

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;

    recognitionRef.current?.abort();
    setError(null);

    const recognition = new Recognition();
    recognition.lang = lang;
    // Site managers pause mid-sentence while they look at something; a
    // single-utterance recogniser would stop on the first breath.
    recognition.continuous = true;
    // Only settled text is emitted, so callers never have to reconcile a
    // partial phrase against what they already appended.
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let finished = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finished += result[0].transcript;
      }
      const text = finished.trim();
      if (text) onTextRef.current(text);
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are ordinary - someone paused, or pressed
      // stop. Reporting them as failures would train people to ignore errors.
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in your browser settings, or type instead."
          : "Dictation stopped unexpectedly. You can keep typing.",
      );
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if called while already running; treat it as already on.
      setListening(true);
    }
  }, [lang]);

  return { supported, listening, error, start, stop };
}
