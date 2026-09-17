"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { ImageUp, Loader2 } from "lucide-react";

import { attachPhoto } from "@/app/(app)/reports/photo-actions";
import { attachSummaryPhoto } from "@/app/(app)/summary-reports/photo-actions";
import { env } from "@/lib/env";
import { compressPhoto } from "@/lib/photo-compress";
import {
  UPLOAD_TIMEOUT_MS,
  nextRetryAt,
  nextToRun,
  targetHref,
  waitingLabel,
  type QueuedPhoto,
} from "@/lib/photo-queue";
import { drainQueue, type CompressedPhoto } from "@/lib/photo-queue-runner";
import {
  getQueueSnapshot,
  getServerQueueSnapshot,
  markDraining,
  noteUploaded,
  pendingElsewhere,
  queueStore,
  requestPersistentStorage,
  subscribeToQueue,
} from "@/lib/photo-queue-store";
import { PHOTO_BUCKET, thumbnailPath } from "@/lib/photos";
import type { Database, PhotoCategory } from "@/types/database";

/** One lock across every tab SiteBoss is open in, so a photograph is never worked twice at once. */
const LOCK_NAME = "siteboss-photo-queue";

/** While anything is pending and nothing is running, look again this often. */
const SAFETY_INTERVAL_MS = 30_000;

/**
 * Writes the photograph and its thumbnail to the bucket at the record's path.
 *
 * A client of its own per attempt, whose fetch carries the drain's abort
 * signal: when the step stalls, the socket is actually closed rather than
 * left to hold the phone's one good connection. The path is the record's,
 * and the write is an upsert, so an object left by a dead page is replaced
 * rather than refused.
 */
async function uploadToBucket(
  record: QueuedPhoto,
  compressed: CompressedPhoto,
  signal: AbortSignal,
): Promise<void> {
  const supabase = createBrowserClient<Database>(env.supabaseUrl, env.supabaseKey, {
    isSingleton: false,
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal }),
    },
  });

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(record.path, compressed.blob, {
    contentType: compressed.blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) {
    throw Object.assign(new Error(error.message), {
      statusCode: (error as { statusCode?: string }).statusCode,
    });
  }

  // Beside the photograph, and never in front of it. A screen with no
  // thumbnail falls back to the photograph itself and looks identical - it
  // just costs more to fetch - so a thumbnail that will not upload is not a
  // reason to tell somebody their site photo did not save.
  if (compressed.thumb) {
    await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(thumbnailPath(record.path), compressed.thumb, {
        contentType: "image/jpeg",
        upsert: true,
      })
      .catch(() => undefined);
  }
}

/** The row. Same path every time, so the server attaches it once however often this runs. */
function attachRecord(record: QueuedPhoto, compressed: CompressedPhoto) {
  const common = {
    storagePath: record.path,
    caption: null,
    category: record.category as PhotoCategory,
    width: compressed.width || null,
    height: compressed.height || null,
  };
  return record.summaryReportId
    ? attachSummaryPhoto({ summaryReportId: record.summaryReportId, ...common })
    : attachPhoto({ projectId: record.projectId, reportId: record.reportId, ...common });
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * The one place the photo queue is drained, mounted in the signed-in shell.
 *
 * It runs whenever the app is open: on mount, when the app comes back to the
 * front, when the signal returns, when a photograph is added, and on the
 * retry clock. It never runs while the phone is locked, because nothing can,
 * and it does not pretend to.
 *
 * It also shows the one app-wide indicator - "3 photos waiting to upload" -
 * for photographs whose own screen is not on show, so a queue can never go
 * quiet just because somebody left the report.
 */
export function PhotoQueueRunner() {
  const router = useRouter();
  const snap = useSyncExternalStore(subscribeToQueue, getQueueSnapshot, getServerQueueSnapshot);
  const running = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Rows landed; the server-rendered grids should show them. Once per drain, trailing. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 1_200);
  }, [router]);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    markDraining(true);
    let uploaded = 0;
    try {
      await drainQueue({
        store: queueStore,
        compress: compressPhoto,
        upload: uploadToBucket,
        attach: attachRecord,
        online: isOnline,
        now: () => Date.now(),
        timeoutMs: UPLOAD_TIMEOUT_MS,
        // Noted per photograph so the screen can say Uploaded; the server
        // grids are refreshed once, when the drain ends, rather than after
        // every photograph - a refresh re-renders the page under whoever is
        // dictating into it, and twenty-five of them in a row is a page that
        // will not hold still.
        onUploaded: (record) => {
          uploaded += 1;
          noteUploaded(record);
        },
      });
    } catch {
      // The store itself failed mid-drain. Nothing was removed on the way in;
      // the next trigger reads it again.
    } finally {
      running.current = false;
      markDraining(false);
      if (uploaded > 0) scheduleRefresh();
    }
  }, [scheduleRefresh]);

  /**
   * Takes the cross-tab lock if it is free and drains under it. Where the
   * Web Locks API is missing, the per-tab flag above is the only guard - a
   * second tab is then a rare double attempt on one path, which the upsert
   * and the attach both absorb.
   */
  const kick = useCallback(() => {
    if (running.current) return;
    if (typeof navigator === "undefined") return;
    const locks = navigator.locks;
    if (locks && typeof locks.request === "function") {
      void locks
        .request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (!lock) return;
          await drain();
        })
        .catch(() => undefined);
    } else {
      void drain();
    }
  }, [drain]);

  // The triggers: launch, front, signal, and a clock while anything waits.
  useEffect(() => {
    void requestPersistentStorage();
    kick();

    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    window.addEventListener("online", kick);
    window.addEventListener("focus", kick);
    window.addEventListener("pageshow", kick);
    document.addEventListener("visibilitychange", onVisible);
    const safety = setInterval(kick, SAFETY_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", kick);
      window.removeEventListener("focus", kick);
      window.removeEventListener("pageshow", kick);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(safety);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [kick]);

  // Something became due - a photograph was just secured, or a wait has
  // ended - and nothing is running: go. A wait still in the future sets a
  // clock for exactly when it ends.
  useEffect(() => {
    // Offline, nothing is due by definition; the `online` event is the trigger.
    if (!snap.loaded || snap.draining || !snap.online) return;
    const now = Date.now();
    if (nextToRun(snap.records, now)) {
      kick();
      return;
    }
    const at = nextRetryAt(snap.records);
    if (at === null) return;
    const timer = setTimeout(kick, Math.max(250, at - now));
    return () => clearTimeout(timer);
  }, [snap.loaded, snap.draining, snap.online, snap.records, kick]);

  const elsewhere = pendingElsewhere(snap);
  if (elsewhere.length === 0) return null;

  return (
    <Link
      href={targetHref(elsewhere[0]!)}
      data-photo-queue-indicator
      className="mb-4 flex items-center gap-3 rounded-control bg-surface px-4 py-3 text-sm font-semibold text-ink shadow-card ring-1 ring-brand/40 ring-inset"
    >
      {snap.draining && snap.online ? (
        <Loader2 className="size-5 shrink-0 animate-spin text-brand" aria-hidden />
      ) : (
        <ImageUp className="size-5 shrink-0 text-brand" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        {waitingLabel(elsewhere.length)}
        <span className="block text-xs font-normal text-ink-muted">
          {snap.online ? "Uploading while SiteBoss is open." : "Waiting for signal."}
        </span>
      </span>
    </Link>
  );
}
