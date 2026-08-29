import Link from "next/link";
import { ChevronRight, Moon } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { ResolvedStore } from "@/lib/stores/directory";

/**
 * One store in a list.
 *
 * The number leads, in a monospaced block, because that is what a site manager
 * is given and what they search for. Everything else is the client's own text,
 * printed as their list has it rather than tidied - a store's address is not
 * ours to rewrite.
 */
export function StoreCard({ store }: { store: ResolvedStore }) {
  return (
    <Card className="transition-colors hover:border-line-strong">
      <Link href={`/stores/${store.code}`} className="flex items-center gap-4 p-4">
        <span className="shrink-0 rounded-lg bg-surface-muted px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums text-ink">
          {store.displayCode}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-semibold text-ink">
            {store.displayName}
            {store.nightShift ? (
              <Moon className="size-4 shrink-0 text-ink-subtle" aria-label="Night shift" />
            ) : null}
          </p>
          <p className="truncate text-sm text-ink-muted">{store.address ?? "No address recorded"}</p>
          {store.rdc ? (
            <p className="mt-1 text-xs font-medium text-ink-subtle">RDC {store.rdc}</p>
          ) : null}
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
      </Link>
    </Card>
  );
}
