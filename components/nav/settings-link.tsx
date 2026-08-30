"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import { settingsHref } from "@/lib/navigation";

/**
 * The gear in the phone's top bar.
 *
 * A client component only so that it knows the screen it is leaving, which it
 * hands to Settings as the way back. See lib/navigation.ts.
 */
export function SettingsLink() {
  const pathname = usePathname();

  return (
    <Link
      href={settingsHref(pathname)}
      aria-label="Settings"
      className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted hover:text-ink"
    >
      <Settings className="size-5" aria-hidden />
    </Link>
  );
}
