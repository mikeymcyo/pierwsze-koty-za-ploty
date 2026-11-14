/**
 * The presentation choices, carried in the report page's own URL.
 *
 * Style, photo layout, cover and whether the documents go in are chosen on
 * the finalise card and live in its state. Preview is a navigation to the
 * viewer, and coming back - by the viewer's Close or by the browser's Back -
 * remounts the card. It used to remount with the defaults, so a report
 * previewed in the Photo style with a cover was issued in the house style
 * with none: the issued PDF is never regenerated, so the only fix was a
 * reopen and a reissue.
 *
 * The choices now go into the page's URL as they are made, with no
 * navigation (history.replaceState), and the viewer's Close carries them back
 * as well. Whichever way somebody returns, the URL holds the choices and the
 * card starts from them. Nothing is stored anywhere new: a URL the page
 * already reads, and the validators the render already uses. Defaults are
 * left out of the query, so the ordinary address stays the ordinary address.
 *
 * Pure, so the round trip is tested without a browser.
 */

import { DEFAULT_PHOTO_LAYOUT, photoLayoutOf, type PhotoLayout } from "./photo-layout";
import { DEFAULT_PDF_STYLE, coverPhotoIdOf, pdfStyleOf, type PdfStyle } from "./presentation";

export type PresentationChoice = {
  style: PdfStyle;
  layout: PhotoLayout;
  /** A photograph id, or null for no cover. */
  cover: string | null;
  includeDocuments: boolean;
};

export const DEFAULT_PRESENTATION: PresentationChoice = {
  style: DEFAULT_PDF_STYLE,
  layout: DEFAULT_PHOTO_LAYOUT,
  cover: null,
  includeDocuments: true,
};

type SearchLike = {
  style?: string | string[];
  layout?: string | string[];
  cover?: string | string[];
  documents?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The choices a page was opened with.
 *
 * Every value goes through the validator the render uses, so a mistyped or
 * hand-edited URL falls back to the default rather than failing. A cover id is
 * only ever an id here: whether it names one of this report's photographs is
 * decided where the cover is picked (pickCoverPhoto), and an id that does not
 * produces no cover.
 */
export function presentationFromSearch(search: SearchLike): PresentationChoice {
  return {
    style: pdfStyleOf(first(search.style)),
    layout: photoLayoutOf(first(search.layout)),
    cover: coverPhotoIdOf(first(search.cover)),
    includeDocuments: first(search.documents) !== "0",
  };
}

/**
 * The same choices written into a URL's query, in place.
 *
 * Only departures from the default are written; a default clears its key, so
 * choosing the house style again leaves no trace. Every other parameter on
 * the URL - ?saved=1, ?resolve=… - is left exactly as it was.
 */
export function applyPresentationToUrl(url: URL, choice: PresentationChoice): URL {
  const set = (key: string, value: string | null) => {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  };
  set("style", choice.style === DEFAULT_PRESENTATION.style ? null : choice.style);
  set("layout", choice.layout === DEFAULT_PRESENTATION.layout ? null : choice.layout);
  set("cover", choice.cover ?? null);
  set("documents", choice.includeDocuments ? null : "0");
  return url;
}

/** The query for a link back to the report, "" when everything is default. */
export function presentationQuery(choice: PresentationChoice): string {
  const url = applyPresentationToUrl(new URL("https://siteboss.invalid/"), choice);
  return url.search;
}
