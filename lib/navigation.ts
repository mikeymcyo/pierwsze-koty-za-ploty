import { FileText, FolderKanban, LayoutDashboard, Plus, User } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** The raised centre action in the mobile bar. */
  primary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/reports/new", label: "Create", icon: Plus, primary: true },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/profile", label: "Profile", icon: User },
];

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
