/**
 * Shared by the server component that reads ?tab= and the client component that
 * renders the tab strip, so it deliberately carries no "use client" directive -
 * a value exported from a client module cannot be called on the server.
 */

export const PROJECT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "reports", label: "Reports" },
  { key: "photos", label: "Photos" },
  { key: "issues", label: "Open Issues" },
  { key: "documents", label: "Documents" },
  { key: "activity", label: "Activity" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["key"];

export function isProjectTab(value: string | undefined): value is ProjectTab {
  return PROJECT_TABS.some((tab) => tab.key === value);
}
