import { FileText, FolderKanban, LayoutDashboard, Plus, Settings, Store } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** The raised centre action in the mobile bar. */
  primary?: boolean;
  /**
   * Kept out of the phone's bottom bar. Six targets there would push the
   * raised Create button off centre, and Profile is the one destination
   * nobody opens with gloves on - it moves to the top bar instead.
   */
  deskOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/reports/new", label: "Create", icon: Plus, primary: true },
  { href: "/stores", label: "Stores", icon: Store },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/profile", label: "Settings", icon: Settings, deskOnly: true },
];

/** What the phone's bottom bar shows: five targets, Create in the middle. */
export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter((item) => !item.deskOnly);

/**
 * A nav item is active for its own route and anything beneath it. "/reports/new"
 * is excluded from "/reports" so the centre button and the Reports tab never
 * light up at the same time.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/reports") {
    return (
      pathname === "/reports" ||
      /^\/reports\/(?!new$)/.test(pathname) ||
      pathname.startsWith("/summary-reports/")
    );
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Settings lives on /profile, which is where it was before it was Settings. */
export const SETTINGS_HREF = "/profile";

/**
 * Only a path on this application.
 *
 * Whatever reaches this came off a URL somebody could have typed, and it ends
 * up in an href - so anything that could point at another origin is refused
 * rather than sanitised into something plausible.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/")) return null;
  // "//host" is a URL to somewhere else; a backslash is one to Safari.
  if (path.startsWith("//") || path.includes("\\") || path.includes("://")) return null;
  return path;
}

/**
 * Settings, remembering where it was opened from.
 *
 * The way back is carried in the link rather than read out of the browser's
 * history: history is not ours to reason about - it holds redirects, form
 * posts and whatever was open in that tab before - and on a phone in a
 * home-screen app there may be no back gesture at all.
 */
export function settingsHref(pathname: string): string {
  const from = safeReturnPath(pathname);
  if (!from || from === SETTINGS_HREF) return SETTINGS_HREF;
  return `${SETTINGS_HREF}?from=${encodeURIComponent(from)}`;
}

/**
 * The control that leaves Settings: where it goes and what it says.
 *
 * Named for the section rather than "Back", so it reads as a destination on a
 * screen somebody may have reached from anywhere. There is always one, even
 * with nothing to go back to - being stranded in Settings is the bug.
 */
export function settingsReturn(from: string | null | undefined): { href: string; label: string } {
  const path = safeReturnPath(from);
  if (!path || path === SETTINGS_HREF) return { href: "/dashboard", label: "Back to Dashboard" };

  const section = NAV_ITEMS.find(
    (item) => !item.primary && item.href !== SETTINGS_HREF && isNavItemActive(item, path),
  );
  return { href: path, label: section ? `Back to ${section.label}` : "Back" };
}
