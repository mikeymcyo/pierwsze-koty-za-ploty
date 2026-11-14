import Link from "next/link";
import { History, X } from "lucide-react";

import { removeRecentLocation } from "@/app/(app)/stores/recent-actions";
import { DirectionsLinks } from "@/components/stores/directions-links";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { directionsUrl, wazeUrl } from "@/lib/stores/directions";
import { recentTitle } from "@/lib/stores/recent";
import type { RecentLocation } from "@/lib/stores/recent-server";

/**
 * The stores this person opened or asked the way to, newest first.
 *
 * On the locator screen while the search box is empty, so a store looked up
 * from a text message on Monday is one tap away on Thursday rather than a
 * second search. Each row is the store's own identity - town and number, then
 * the address - and opens the store; Directions and Waze sit beside it, and
 * a small cross takes the row off the list. History, not a CRM: nothing here
 * is a note, a status or a lead, and removing a row changes nothing else.
 */
export function RecentLocations({ recent }: { recent: RecentLocation[] }) {
  if (recent.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" data-recent-locations>
      <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-ink">
        <History className="size-4 text-ink-subtle" aria-hidden />
        Recent locations
      </h2>
      <ul className="flex flex-col gap-3">
        {recent.map(({ store }) => (
          <li key={`${store.directoryId}:${store.code}`}>
            <Card className="transition-colors hover:border-line-strong">
              <div className="flex items-start gap-3 p-4">
                <Link href={`/stores/${store.code}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{recentTitle(store)}</p>
                  <p className="truncate text-sm text-ink-muted">
                    {store.address ?? "No address recorded"}
                  </p>
                </Link>
                {/* One tap. A row is history, not evidence; putting it back
                    is opening the store again. */}
                <form action={removeRecentLocation} className="shrink-0">
                  <input type="hidden" name="directory" value={store.directoryId} />
                  <input type="hidden" name="code" value={store.code} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="size-9 text-ink-subtle"
                    aria-label={`Remove ${recentTitle(store)} from recent locations`}
                  >
                    <X aria-hidden />
                  </Button>
                </form>
              </div>
              <div className="flex gap-2 px-4 pb-4">
                <DirectionsLinks
                  directory={store.directoryId}
                  code={store.code}
                  directions={directionsUrl(store)}
                  waze={wazeUrl(store)}
                  size="sm"
                  className="flex-1"
                />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
