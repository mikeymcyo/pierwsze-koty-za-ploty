import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Moon, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireSessionContext } from "@/lib/auth/session";
import { findStoreAnywhere } from "@/lib/stores/catalogue";
import { directionsUrl } from "@/lib/stores/directions";
import { newProjectHref } from "@/lib/stores/project-link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const store = findStoreAnywhere(code);
  return { title: store ? `${store.displayName} · ${store.displayCode}` : "Store" };
}

/**
 * One store.
 *
 * The facts the client's list holds, a way to get there, and a way to start a
 * job here. Nothing is shown that the list does not actually contain - a store
 * whose night shift has not been reviewed says so rather than implying there
 * is not one.
 */
export default async function StorePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireSessionContext();
  const { code } = await params;
  const store = findStoreAnywhere(code);
  if (!store) notFound();

  const directions = directionsUrl(store);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/stores"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Store locator
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink-muted">{store.client}</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          {store.displayName}
        </h1>
        <p className="font-mono text-sm font-semibold tabular-nums text-ink-muted">
          Store {store.displayCode}
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Detail label="Address" value={store.address} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Postcode" value={store.postcode} />
            <Detail label="RDC" value={store.rdc} />
          </div>
          <Detail
            label="Night shift"
            value={
              store.nightShift === null
                ? "Not reviewed"
                : store.nightShift
                  ? store.nightShiftHours ?? "Yes"
                  : "No"
            }
            icon={store.nightShift ? <Moon className="size-4" aria-hidden /> : null}
            muted={store.nightShift === null}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        {directions ? (
          <Button asChild size="lg" variant="secondary" className="sm:flex-1">
            {/* A plain Google Maps link: it opens the Maps app on an iPhone or
                iPad when it is installed and the website when it is not, needs
                no API key, and cannot stop working because a billing account
                lapsed. */}
            <a href={directions} target="_blank" rel="noopener noreferrer">
              <MapPin aria-hidden />
              Directions
            </a>
          </Button>
        ) : null}
        <Button asChild size="lg" className="sm:flex-1">
          <Link href={newProjectHref(store)}>
            <Plus aria-hidden />
            Create project here
          </Link>
        </Button>
      </div>

      <p className="text-sm text-ink-subtle">
        A store is the place; a project is one package of works at it. The same store can
        carry several projects over the years, each with its own reports, issues and photographs.
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
  icon,
  muted,
}: {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      <p
        className={
          muted
            ? "flex items-center gap-2 text-ink-subtle"
            : "flex items-center gap-2 text-ink"
        }
      >
        {icon}
        {value ?? "Not recorded"}
      </p>
    </div>
  );
}
