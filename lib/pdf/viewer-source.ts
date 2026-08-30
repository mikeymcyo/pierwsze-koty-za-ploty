/**
 * Which PDF the viewer is looking at.
 *
 * Pure, with no runtime imports and no path aliases, so the rule can be tested
 * without a database and reads the same way from both viewer pages.
 *
 * There are only two kinds of bytes and they must never be confused. The
 * stored file is what somebody was sent; the preview is a render of what would
 * be sent if the report were issued now. So the issued view is served from
 * storage and never rendered, and the draft view is rendered and never
 * presented as the record. A report that was issued and then reopened has both
 * - its client still holds the issued PDF while the corrections are in
 * progress - which is why `wantsDraft` exists rather than a guess.
 */

export type ViewerState = {
  status: "draft" | "final";
  /** Whether the report was issued and reopened. See lib/reports/lifecycle.ts.
   *  Passed in rather than derived here, so that rule lives in one place. */
  reopened: boolean;
  pdfPath: string | null;
  /** The caller asked for the corrections in progress, not the issued PDF. */
  wantsDraft: boolean;
  /** Query carried into the preview so it renders the package that would be
   *  issued: the appendices, the style, the cover photograph. */
  previewQuery?: string;
};

export type ViewerSource = {
  /** True when these bytes are the stored record rather than a fresh render. */
  showingIssued: boolean;
  /**
   * Same-origin, always. The reader fetches the bytes to draw them, and the
   * share sheet fetches them to make a file - neither can be done reliably
   * across origins, and a signed storage URL also expires ten minutes after
   * the page rendered, which is a plausible time to spend reading a report.
   *
   * Null when the issued file is the thing to show and there is no path to it.
   */
  src: string | null;
};

export function viewerSource(base: string, state: ViewerState): ViewerSource {
  const showingIssued = state.status === "final" || (state.reopened && !state.wantsDraft);

  if (showingIssued) {
    return { showingIssued: true, src: state.pdfPath ? `${base}/file` : null };
  }

  const query = state.previewQuery ? `&${state.previewQuery}` : "";
  return { showingIssued: false, src: `${base}/preview?draft=1${query}` };
}
