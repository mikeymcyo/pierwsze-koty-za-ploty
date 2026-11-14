"use client";

import { useEffect } from "react";

/**
 * Tells the server this store was opened or asked the way to.
 *
 * A beacon, not a fetch that waits for an answer: the moment after a
 * Directions tap is the moment the browser hands the screen to Maps or
 * Waze, and an ordinary request started then can be dropped with the page.
 * `navigator.sendBeacon` is the browser's promise to deliver a small POST
 * through a page hide; `fetch` with `keepalive` is the same promise where
 * the beacon API is missing. Neither is awaited - nothing on the screen
 * depends on the answer, and the worst case is one store not remembered.
 *
 * The body names a directory and a store code and nothing else. Who is
 * asking is the session cookie's business, on the server.
 */
export function recordRecentVisit(directory: string, code: string): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ directory, code });
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/stores/recent", blob)) return;
    }
  } catch {
    // Fall through to fetch.
  }
  void fetch("/stores/recent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}

/** Records the store on the screen as visited, once, when the screen opens. */
export function RecentRecorder({ directory, code }: { directory: string; code: string }) {
  useEffect(() => {
    recordRecentVisit(directory, code);
  }, [directory, code]);
  return null;
}
