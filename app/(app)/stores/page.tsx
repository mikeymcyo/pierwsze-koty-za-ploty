import type { Metadata } from "next";
import { Store as StoreIcon } from "lucide-react";

import { StoreCard } from "@/components/stores/store-card";
import { StoreSearch } from "@/components/stores/store-search";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth/session";
import { defaultDirectory } from "@/lib/stores/catalogue";
import { distributionCentres, searchStores } from "@/lib/stores/directory";

export const metadata: Metadata = { title: "Store locator" };

/**
 * The client's store directory, inside SiteBoss.
 *
 * Search happens on the server against a list that ships with the build, so
 * the phone downloads a short page of results rather than thirteen hundred
 * stores it will not look at. The query lives in the URL, which makes a search
 * something you can send to somebody.
 *
 * The directory is reference data and carries nothing belonging to a company:
 * no project, report, issue, photo or document is read here, so there is
 * nothing for the store screens to leak between tenants. Everything that is
 * company data stays behind the same session and RLS as before.
 */
export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rdc?: string; night?: string }>;
}) {
  await requireSessionContext();
  const search = await searchParams;
  const { directory, stores } = defaultDirectory();

  const results = searchStores(stores, {
    text: search.q,
    rdc: search.rdc || null,
    nightShiftOnly: search.night === "1",
  });

  const nightShiftCount = stores.filter((store) => store.nightShift === true).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Store locator</h1>
        <p className="text-ink-muted">
          {directory.label} · {stores.length} stores · {directory.source}
        </p>
      </header>

      <StoreSearch rdcs={distributionCentres(stores)} nightShiftCount={nightShiftCount} />

      {results.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No stores match that search"
          description="Try the store number on its own, the town, or the first half of the postcode."
        />
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {results.length === stores.length
              ? `${stores.length} stores`
              : `${results.length}${results.length === 60 ? "+" : ""} of ${stores.length} stores`}
          </p>
          <ul className="flex flex-col gap-3">
            {results.map((store) => (
              <li key={store.code}>
                <StoreCard store={store} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
