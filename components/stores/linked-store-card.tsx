import Link from "next/link";
import { MapPin, Moon, Navigation, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { directionsUrl, wazeUrl } from "@/lib/stores/directions";
import type { ResolvedStore } from "@/lib/stores/directory";

/**
 * The place a project is at, on the project's own page.
 *
 * Read from the directory every time rather than copied onto the project, so
 * a corrected address reaches every project at that store at once. What an
 * already issued report says is unaffected either way: an issued PDF is a
 * stored file.
 */
export function LinkedStoreCard({ store }: { store: ResolvedStore }) {
  const directions = directionsUrl(store);
  const waze = wazeUrl(store);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-muted text-ink-muted">
            <Store className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {store.client}
            </p>
            <p className="truncate font-semibold text-ink">{store.displayName}</p>
            <p className="font-mono text-sm tabular-nums text-ink-muted">
              Store {store.displayCode}
              {store.rdc ? ` · RDC ${store.rdc}` : ""}
            </p>
            {store.address ? (
              <p className="mt-1 text-sm text-ink-muted">{store.address}</p>
            ) : null}
            {store.nightShift ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                <Moon className="size-4" aria-hidden />
                Night shift {store.nightShiftHours ? `· ${store.nightShiftHours}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {directions ? (
            <Button asChild variant="secondary" className="sm:flex-1">
              <a href={directions} target="_blank" rel="noopener noreferrer">
                <MapPin aria-hidden />
                Directions
              </a>
            </Button>
          ) : null}
          {/* Beside it, not instead of it. Two links to the same place, and
              whichever app is on the phone is the one that opens. */}
          {waze ? (
            <Button asChild variant="secondary" className="sm:flex-1">
              <a href={waze} target="_blank" rel="noopener noreferrer">
                <Navigation aria-hidden />
                Waze
              </a>
            </Button>
          ) : null}
          <Button asChild variant="secondary" className="sm:flex-1">
            <Link href={`/stores/${store.code}`}>View store</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * What a project linked to a store this build's directory no longer lists
 * shows instead.
 *
 * Silence would be worse: the project genuinely records a place, and somebody
 * needs to know the directory has moved on rather than assuming the link was
 * never made.
 */
export function UnknownStoreCard({
  link,
}: {
  link: { directory: string; code: string };
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Store or location
        </p>
        <p className="mt-1 font-medium text-ink">
          Store {link.code} is not in the current directory
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          The project still records it. It may have been renumbered or closed since this
          build&apos;s store list was imported.
        </p>
      </CardContent>
    </Card>
  );
}
