"use client";

import { useRef, useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Sharing the issued PDF from a phone or an iPad.
 *
 * On iOS this hands the file to the system share sheet, which is what the
 * device is for: WhatsApp, Mail, Teams, AirDrop, Files - whatever the site
 * manager actually uses, without SiteBoss needing to know about any of them.
 *
 * The file is the stored, issued PDF, fetched from our own origin. Nothing is
 * re-rendered to share it: an issued document is the record, and a "share"
 * that quietly produced a second, slightly different file would be the worst
 * kind of bug - two documents, both claiming to be the one that was sent.
 *
 * Two details that matter on iOS:
 *
 * - Safari only allows `navigator.share` while a tap is still "fresh", and a
 *   several-megabyte download blows through that. So the fetch is started on
 *   pointer-down, before the click lands, and the result is kept - by the time
 *   the tap completes the file is usually already in hand.
 * - Where the browser cannot share files at all - most desktops, a locked-down
 *   browser, or a page that is not on HTTPS - the button saves the PDF
 *   instead. Both are ways of getting the document out; the device decides
 *   which one it can do.
 */
export function SharePdf({
  href,
  fileName,
  title,
  variant = "secondary",
  size = "lg",
}: {
  /** Same-origin route that streams the stored PDF. */
  href: string;
  fileName: string;
  /** What the share sheet calls it. */
  title: string;
  variant?: "primary" | "secondary" | "ghost";
  /** Small where it sits in the reader's header beside Close. */
  size?: "sm" | "md" | "lg";
}) {
  const pending = useRef<Promise<File> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Started on pointer-down so the bytes are usually here before the tap
  // finishes. Cached, so a second press does not fetch the file twice.
  function warm(): Promise<File> {
    pending.current ??= fetch(href, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`The PDF could not be fetched (${response.status}).`);
      const blob = await response.blob();
      return new File([blob], fileName, { type: "application/pdf" });
    });
    return pending.current;
  }

  function save(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    // Long enough for the download to have started, short enough not to hold
    // several megabytes in memory for the rest of the session.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function share() {
    setError(null);
    setBusy(true);
    try {
      const file = await warm();
      const data: ShareData = { files: [file], title };
      if (typeof navigator !== "undefined" && navigator.canShare?.(data)) {
        await navigator.share(data);
      } else {
        save(file);
      }
    } catch (cause) {
      // Dismissing the share sheet is not a failure and must not be reported
      // as one.
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      // A share the device refused after all - fall back to saving it rather
      // than leaving somebody holding nothing.
      const file = await pending.current?.catch(() => null);
      if (file) {
        save(file);
        return;
      }
      pending.current = null;
      setError("The PDF could not be shared just now. It has not changed - try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={busy}
        onPointerDown={() => {
          void warm().catch(() => {});
        }}
        onClick={share}
      >
        {/* One icon in both cases. Choosing it from `navigator` would mean
            the server and the browser rendering different markup, which React
            reports as a hydration fault - and a device that cannot open a
            share sheet still gets the document, as a saved file. */}
        <Share2 aria-hidden />
        {busy ? "Preparing…" : "Share PDF"}
      </Button>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </span>
  );
}
