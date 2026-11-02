"use client";

import { useState } from "react";
import { Camera, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Google is contacted only after a deliberate click. Never copy the imagery. */
export function StoreVisionStreetView({ storeName, embedUrl, mapsUrl }: {
  storeName: string; embedUrl: string; mapsUrl: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={`Street View at ${storeName}`} className="midnight-panel overflow-hidden rounded-card">
      <div className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-semibold tracking-widest text-info">STOREVISION</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">See the store before you arrive</h2>
          <p className="mt-2 text-sm text-ink-muted">Explore Google Street View. Imagery may show an older view of the site.</p>
        </div>
        <Camera className="size-6 shrink-0 text-brand-ink" aria-hidden />
      </div>
      {open ? (
        <div>
          <iframe
            title={`Google Street View — ${storeName}`}
            src={embedUrl}
            className="h-80 min-h-[200px] w-full border-0 sm:h-96"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X aria-hidden />Close view</Button>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-info">Open in Google Maps<ExternalLink className="size-4" aria-hidden /></a>
          </div>
          <p className="px-5 pb-4 text-xs text-ink-muted">If the view is unavailable or points away from the entrance, open Google Maps to check the location.</p>
        </div>
      ) : (
        <div className="px-5 pb-5">
          <Button onClick={() => setOpen(true)}><Camera aria-hidden />Show Street View</Button>
          <p className="mt-3 text-xs text-ink-muted">Loads interactive imagery from Google Maps when opened.</p>
        </div>
      )}
    </section>
  );
}
