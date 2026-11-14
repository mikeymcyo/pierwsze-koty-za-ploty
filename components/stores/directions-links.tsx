"use client";

import { MapPin, Navigation } from "lucide-react";

import { Button } from "@/components/ui/button";
import { recordRecentVisit } from "@/components/stores/recent-recorder";

/**
 * Directions and Waze for one store, recorded as a visit when tapped.
 *
 * The links are exactly what they were - plain Google Maps and Waze
 * universal links, computed on the server and handed in as hrefs, opening
 * the app that is on the phone. The one addition is the beacon on tap, sent
 * before the browser follows the link, so the store lands in Recent
 * locations even though the very next thing that happens is another app
 * taking the screen.
 */
export function DirectionsLinks({
  directory,
  code,
  directions,
  waze,
  size = "md",
  className,
}: {
  directory: string;
  code: string;
  directions: string | null;
  waze: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const record = () => recordRecentVisit(directory, code);
  return (
    <>
      {directions ? (
        <Button asChild size={size} variant="secondary" className={className}>
          <a href={directions} target="_blank" rel="noopener noreferrer" onClick={record}>
            <MapPin aria-hidden />
            Directions
          </a>
        </Button>
      ) : null}
      {waze ? (
        <Button asChild size={size} variant="secondary" className={className}>
          <a href={waze} target="_blank" rel="noopener noreferrer" onClick={record}>
            <Navigation aria-hidden />
            Waze
          </a>
        </Button>
      ) : null}
    </>
  );
}
