import { reportPlace } from "@/lib/reports/report-place";
import { storeFor } from "@/lib/stores/catalogue";
import { storeLinkOf } from "@/lib/stores/project-link";

/**
 * Where a project is, for the line under a report's title.
 *
 * Server-side: the store is resolved from the directory that ships with this
 * build, as the project page does, so a corrected store name reaches every
 * list at once. The rows themselves only ever receive the finished string.
 */
export function placeOfProject(
  project:
    | {
        site_address?: string | null;
        postcode?: string | null;
        location_directory?: string | null;
        location_code?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!project) return null;
  const link = storeLinkOf(project);
  return reportPlace(project, link ? storeFor(link.directory, link.code) : null);
}
