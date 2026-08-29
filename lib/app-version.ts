/**
 * Which version of SiteBoss this is.
 *
 * Read from package.json at build time rather than hard-coded, so the number
 * on the settings screen and the number in the repository cannot drift apart.
 * Paired with the short commit SHA from lib/build-info.ts, which says which
 * build of that version is actually running.
 */

import { version } from "@/package.json";

export const APP_VERSION: string = version;
