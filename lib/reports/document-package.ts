/**
 * Whether the issued PDF carries its supporting documents, and in what order.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a renderer or a database.
 */

/**
 * The default is to include them.
 *
 * Somebody who linked a drawing to a report meant it to go with the report,
 * and a client who receives the report without the drawing has to come back
 * and ask. The toggle exists for the case where the pack is enormous or the
 * client already holds the drawings, not as the normal path.
 *
 * The flag arrives as a string from a form field or a query parameter, so
 * "0" and "false" turn it off and anything absent leaves the default alone.
 */
export function shouldIncludeDocuments(
  flag: string | null | undefined,
  hasDocuments: boolean,
): boolean {
  if (!hasDocuments) return false;
  if (flag === undefined || flag === null || flag === "") return true;
  const value = flag.trim().toLowerCase();
  return !(value === "0" || value === "false" || value === "off" || value === "no");
}

/** What the query parameter and form field carry. */
export function documentsFlag(include: boolean): string {
  return include ? "1" : "0";
}

export type PackagedDocument = {
  documentId: string;
  title: string;
  storagePath: string | null;
  sortOrder: number;
};

/**
 * The order the documents are appended in.
 *
 * The order the user put them in, which is what the register above them
 * already prints. Ties fall back to the document id so a report re-issued
 * twice from the same selection produces the same package both times - an
 * issued document that shuffles its own appendices between revisions would be
 * impossible to compare.
 */
export function orderAttachments<T extends PackagedDocument>(documents: readonly T[]): T[] {
  return [...documents].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.documentId.localeCompare(b.documentId),
  );
}

/**
 * Documents that are selected but have no file behind them any more.
 *
 * Only reachable where a document was deleted while a draft still referenced
 * it. Blocking is deliberate: a register naming five drawings above four sets
 * of pages is worse than a refusal, because nobody notices until the missing
 * one is the one that matters.
 */
export function unavailableDocuments<T extends PackagedDocument>(
  documents: readonly T[],
): string[] {
  return documents.filter((document) => !document.storagePath).map((document) => document.title);
}

export function describeUnavailable(titles: readonly string[]): string {
  if (titles.length === 0) return "";
  const list = titles.join(", ");
  return titles.length === 1
    ? `"${list}" is no longer stored, so nothing has been issued. Unlink it from this report, or upload it again.`
    : `${titles.length} supporting documents are no longer stored, so nothing has been issued: ${list}. Unlink them from this report, or upload them again.`;
}

/** One line under the toggle, so the user knows what they are about to send. */
export function describePackageChoice(input: {
  include: boolean;
  documentCount: number;
}): string {
  if (input.documentCount === 0) {
    return "No supporting documents are linked to this report.";
  }
  const documents =
    input.documentCount === 1 ? "1 supporting document" : `${input.documentCount} supporting documents`;
  return input.include
    ? `${documents} will be appended in full after the report, as one PDF the client can keep.`
    : `${documents} will be listed in the report but not attached. The client will receive the report only.`;
}
