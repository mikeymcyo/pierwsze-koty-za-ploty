import { FileText, FolderKanban, LayoutDashboard, Plus, Store, User } from "lucide-react";

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
  { href: "/profile", label: "Profile", icon: User, deskOnly: true },
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
