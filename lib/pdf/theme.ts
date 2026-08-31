/**
 * One visual system for every issued PDF.
 *
 * Daily, Progress and Completion Reports are the same document family and have
 * to look like it - a client who receives all three should recognise them at a
 * glance and never have to work out which contractor sent which. Before this,
 * each document carried its own hard-coded sizes and greys, and they had
 * already drifted apart.
 *
 * The colours are the application's own, lifted from `app/globals.css`, so the
 * report a site manager sees on screen and the PDF a client opens are the same
 * product: black and charcoal on white, with the SiteBoss amber used sparingly
 * as an accent rather than as a fill.
 *
 * This is also the seam for tenant branding later. Nothing below is baked into
 * a component: `createPdfStyles` takes a theme, so introducing a per-company
 * accent, logo or template is a matter of passing a different one rather than
 * of finding every literal in two large JSX files. Deliberately no more than
 * that - the tenant system itself is not this batch's work.
 */

import { StyleSheet } from "@react-pdf/renderer";

import { DEFAULT_PDF_STYLE, type PdfStyle } from "@/lib/pdf/presentation";

export type PdfTheme = {
  /** Which of the three export styles this is. */
  key: PdfStyle;
  /** The product's own identity, printed small at the head of every page. */
  productName: string;
  colors: {
    ink: string;
    charcoal: string;
    muted: string;
    faint: string;
    line: string;
    rule: string;
    panel: string;
    /** The accent as a mark: rules, ticks, blocks. Not for text. */
    accent: string;
    /** The accent dark enough to read as text on white. */
    accentInk: string;
    inverse: string;
  };
  /**
   * Whether the document can afford to breathe.
   *
   * A Daily Report is read the day after it is written and should stay short;
   * a Completion Report is a formal record and is allowed the extra air. This
   * is the only lever between them - the components are identical.
   */
  density: "compact" | "standard";
  /** How much of the first page a cover photograph may take, in points. */
  cover: { maxHeight: number };
  /** The height a photographic plate is printed between, in points. */
  plate: { min: number; max: number };
};

/**
 * The three palettes.
 *
 * SiteBoss is the application's own, lifted from `app/globals.css`. Corporate
 * drops the accent entirely - the amber becomes a grey, the rules soften, the
 * control panel loses its tint - for a client whose own paperwork is plain.
 * Photo prints in the house colours and spends its difference on the
 * photographs instead, which is what `cover` and `plate` below are for.
 */
const PALETTES: Record<PdfStyle, PdfTheme["colors"]> = {
  siteboss: {
    ink: "#18181b",
    charcoal: "#3f3f46",
    muted: "#52525b",
    faint: "#71717a",
    line: "#e4e4e7",
    rule: "#18181b",
    panel: "#fafafa",
    accent: "#f59e0b",
    accentInk: "#b45309",
    inverse: "#ffffff",
  },
  corporate: {
    ink: "#18181b",
    charcoal: "#3f3f46",
    muted: "#52525b",
    faint: "#8a8a93",
    line: "#e4e4e7",
    rule: "#a1a1aa",
    panel: "#ffffff",
    // Not amber. The accent still exists as a mark - the rule stub, the
    // section tick - so the document keeps its structure; it is simply the
    // same grey family as everything else on the page.
    accent: "#52525b",
    accentInk: "#3f3f46",
    inverse: "#ffffff",
  },
  photo: {
    ink: "#18181b",
    charcoal: "#3f3f46",
    muted: "#52525b",
    faint: "#71717a",
    line: "#e4e4e7",
    rule: "#18181b",
    panel: "#fafafa",
    accent: "#f59e0b",
    accentInk: "#b45309",
    inverse: "#ffffff",
  },
};

/** A third of the page in Photo style, a band in the other two. */
const COVER_HEIGHT: Record<PdfStyle, number> = {
  siteboss: 170,
  corporate: 150,
  photo: 310,
};

const PLATE_BOUNDS: Record<PdfStyle, { min: number; max: number }> = {
  siteboss: { min: 110, max: 190 },
  corporate: { min: 110, max: 190 },
  photo: { min: 130, max: 240 },
};

/**
 * The theme for one document: which style, and how much air it is allowed.
 *
 * Density is the document's own business rather than the user's - a Daily
 * Report is read the day after it is written and stays tight, a Completion
 * Report is a formal record - so it is a separate argument from the style,
 * which is the user's choice.
 */
export function pdfTheme(
  style: PdfStyle = DEFAULT_PDF_STYLE,
  density: PdfTheme["density"] = "standard",
): PdfTheme {
  return {
    key: style,
    productName: "SiteBoss Pro",
    colors: PALETTES[style] ?? PALETTES[DEFAULT_PDF_STYLE],
    density,
    cover: { maxHeight: COVER_HEIGHT[style] ?? COVER_HEIGHT[DEFAULT_PDF_STYLE] },
    plate: PLATE_BOUNDS[style] ?? PLATE_BOUNDS[DEFAULT_PDF_STYLE],
  };
}

export const defaultPdfTheme: PdfTheme = pdfTheme(DEFAULT_PDF_STYLE, "standard");

/** The same system, tightened. Used by the Daily Report. */
export const compactPdfTheme: PdfTheme = pdfTheme(DEFAULT_PDF_STYLE, "compact");

const PAGE_MARGIN = 40;

/**
 * The whole stylesheet, derived from a theme.
 *
 * One place for every size and colour in the reports. The scale is deliberately
 * short - 7.5 through 17 - because a document with nine type sizes reads as an
 * accident rather than as a design.
 */
export function createPdfStyles(theme: PdfTheme) {
  const c = theme.colors;
  const roomy = theme.density === "standard";
  const sectionGap = roomy ? 14 : 11;

  return StyleSheet.create({
    // ---- page -------------------------------------------------------------
    page: {
      paddingTop: 32,
      paddingBottom: 46,
      paddingHorizontal: PAGE_MARGIN,
      fontSize: 9.5,
      color: c.ink,
      fontFamily: "Helvetica",
      // No lineHeight here on purpose. react-pdf drops a `fixed` element that
      // is also absolutely positioned as soon as a line height reaches it, and
      // a page style is inherited - which is why no issued SiteBoss PDF has
      // ever carried its running footer. Prose sets its own below.
    },

    // ---- running header ---------------------------------------------------
    header: { marginBottom: roomy ? 16 : 13 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingBottom: 5,
    },
    // Deliberately quiet, and much quieter than it was. This is a strip that
    // repeats on every page of a document a client reads for its content: at
    // 11pt bold it was the loudest thing on the page after the title, and on a
    // three-page report it said the product's name three times in letters
    // bigger than the client's own. It exists so a page separated from the
    // rest can be placed, which 7pt grey does perfectly well.
    headerBrand: {
      fontSize: 7,
      fontFamily: "Helvetica",
      letterSpacing: 0.9,
      textTransform: "uppercase",
      color: c.faint,
    },
    // The contractor, not the product: of the two names on this strip, this is
    // the one the reader has a relationship with.
    headerCompany: { fontSize: 7.5, color: c.muted, letterSpacing: 0.2 },
    // A short accent stub against a full rule: the accent is a mark on the
    // page, never a band across it. Thinner than it was, for the same reason
    // the name above it is smaller.
    rule: { flexDirection: "row", height: 1.25 },
    ruleAccent: { width: 28, backgroundColor: c.accent },
    ruleRest: { flex: 1, backgroundColor: c.rule },

    // ---- cover photograph -------------------------------------------------
    // Optional, and printed at the photograph's own shape - see fitBox in
    // lib/pdf/image-size.ts. Nothing is cropped to fill a band: a cover is
    // still a photograph of the job, and a crop can cut out the thing it was
    // taken for.
    cover: { marginBottom: roomy ? 12 : 10 },
    coverCaption: { fontSize: 7.5, color: c.faint, marginTop: 3, lineHeight: 1.35 },

    // ---- document identity ------------------------------------------------
    titleBlock: { marginBottom: roomy ? 11 : 9 },
    titleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    docType: {
      fontSize: 15,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 1.4,
      textTransform: "uppercase",
      color: c.ink,
    },
    docTypeLarge: {
      fontSize: 17,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 1.6,
      textTransform: "uppercase",
      color: c.ink,
    },
    docNumberLabel: { fontSize: 7.5, color: c.faint, letterSpacing: 1, textTransform: "uppercase" },
    docNumber: { fontSize: 15, fontFamily: "Helvetica-Bold", color: c.ink, textAlign: "right" },
    docProject: { fontSize: 12, fontFamily: "Helvetica-Bold", color: c.ink, marginTop: 6 },
    docContext: { fontSize: 9, color: c.muted, marginTop: 1, lineHeight: 1.35 },

    // ---- document control panel ------------------------------------------
    control: {
      flexDirection: "row",
      flexWrap: "wrap",
      backgroundColor: c.panel,
      borderLeftWidth: 2,
      borderLeftColor: c.accent,
      borderTopWidth: 1,
      borderTopColor: c.line,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      borderRightWidth: 1,
      borderRightColor: c.line,
      paddingVertical: 6,
      paddingLeft: 10,
      paddingRight: 4,
      marginBottom: roomy ? 4 : 2,
    },
    controlCell: { width: "33.33%", paddingRight: 10, paddingVertical: 2.5 },
    controlLabel: {
      fontSize: 7,
      color: c.faint,
      letterSpacing: 0.9,
      textTransform: "uppercase",
      marginBottom: 1,
    },
    controlValue: { fontSize: 9, color: c.ink, lineHeight: 1.3 },

    // ---- section heading --------------------------------------------------
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: c.rule,
      paddingBottom: 4,
      marginTop: sectionGap,
      marginBottom: 7,
    },
    sectionTick: { width: 3, height: 9, backgroundColor: c.accent, marginRight: 6 },
    sectionTitle: {
      fontSize: 9.5,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: c.ink,
    },
    sectionNote: { fontSize: 8, color: c.muted, marginLeft: "auto" },

    // ---- body -------------------------------------------------------------
    // fontSize is repeated on every style that sets lineHeight, and must be:
    // react-pdf resolves a line height against the element's own font size and
    // falls back to its default of 18 rather than to the inherited one, so
    // prose that only inherited its size came out at two and a half times the
    // leading it asked for.
    paragraph: { fontSize: 9.5, marginBottom: 3, lineHeight: 1.4 },
    /**
     * One workstream on its own line.
     *
     * A completion report covering three or four distinct elements reads as a
     * wall of prose when they are run together. The indent is a hanging one -
     * the marker sits in the left margin of the line - so a wrapped line stays
     * aligned under the text rather than under the dash.
     */
    bulletRow: { flexDirection: "row", marginBottom: 2 },
    bulletMark: { fontSize: 9.5, lineHeight: 1.4, width: 10 },
    bulletText: { fontSize: 9.5, lineHeight: 1.4, flex: 1 },
    /**
     * The run-in label at the head of a paragraph: "Works completed."
     *
     * A visible structure of three sections means the stored sections no
     * longer get a heading each. This is what keeps their status on the page -
     * the difference between work recorded as completed and work recorded as
     * planned is what a dispute turns on, so it is set in bold ink rather than
     * left to the wording of the sentence that follows it.
     */
    runIn: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: c.ink, lineHeight: 1.4 },
    /** Names one table inside the appendix, without spending a section heading on it. */
    recordLabel: {
      fontSize: 8.5,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.muted,
      marginTop: 7,
      marginBottom: 3,
    },
    /** Prose inside a card or a cell, where the paragraph spacing is wrong. */
    text: { fontSize: 9.5, lineHeight: 1.4 },
    empty: { fontSize: 9.5, color: c.faint, fontStyle: "italic", lineHeight: 1.4 },
    note: { fontSize: 8, color: c.muted, marginTop: 5, lineHeight: 1.4 },

    // ---- tables -----------------------------------------------------------
    tableHeadRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: c.rule,
      paddingBottom: 4,
    },
    tableHeadCell: {
      fontSize: 7,
      fontFamily: "Helvetica-Bold",
      color: c.muted,
      letterSpacing: 0.9,
      textTransform: "uppercase",
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: 0.75,
      borderBottomColor: c.line,
      paddingVertical: 5,
    },
    tableCell: { fontSize: 9, lineHeight: 1.35 },
    numeric: { textAlign: "right" },

    // ---- status badges ----------------------------------------------------
    badgeRow: { flexDirection: "row", marginTop: 3, marginBottom: 2 },
    badge: {
      borderWidth: 0.75,
      paddingHorizontal: 4,
      paddingVertical: 1.5,
      marginRight: 5,
      borderRadius: 1.5,
    },
    badgeText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.8 },

    // ---- issue record -----------------------------------------------------
    issue: {
      borderLeftWidth: 2,
      paddingLeft: 9,
      paddingBottom: 2,
      marginBottom: roomy ? 9 : 7,
    },
    issueTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: c.ink },
    issueField: { marginTop: 3 },
    issueFieldLabel: {
      fontSize: 7,
      color: c.faint,
      letterSpacing: 0.9,
      textTransform: "uppercase",
      marginBottom: 1,
    },

    // ---- photographic evidence -------------------------------------------
    // Explicit rows rather than a wrapping grid. react-pdf lays a wrapping
    // container out as one block and breaks it badly across pages - four
    // plates came out two to a page with two thirds of each page empty. A row
    // at a time paginates like any other stack of blocks.
    photoRow: { flexDirection: "row", marginTop: 2 },
    photoCell: { width: "50%", paddingRight: 12, paddingBottom: 10 },
    photoRef: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: c.ink,
      letterSpacing: 0.6,
    },
    photoRefRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
    photoRefTick: { width: 2, height: 8, backgroundColor: c.accent, marginRight: 4 },
    photoStatus: {
      fontSize: 7,
      color: c.muted,
      letterSpacing: 0.9,
      textTransform: "uppercase",
      marginLeft: 5,
    },
    // The frame is drawn at the photograph's own printed size, not at the
    // column width, so a portrait plate is a portrait plate rather than a
    // landscape box with grey bars beside it. Nothing is cropped: a cropped
    // photograph can cut out the very thing it was taken to evidence.
    photoFrame: {
      backgroundColor: c.panel,
      borderWidth: 0.75,
      borderColor: c.line,
      padding: 2,
      marginBottom: 3,
    },
    /**
     * Under the plate. A quarter-point larger and set in the muted ink rather
     * than the body's, so it reads as a caption rather than as a stray
     * sentence - with the leading tightened to match, so the line is no taller
     * than it was. A caption that costs a photograph its height is a bad
     * trade: half a point on this line put a one-plate progress report onto a
     * second page.
     */
    photoCaption: { fontSize: 8.75, color: c.muted, lineHeight: 1.3 },
    photoNoCaption: { fontSize: 8.5, color: c.faint, fontStyle: "italic" },

    // ---- source record ----------------------------------------------------
    sourceLine: { fontSize: 8.5, color: c.muted, marginBottom: 1.5, lineHeight: 1.35 },

    // ---- sign-off ---------------------------------------------------------
    // A place for a wet signature on a printed copy, and nothing more. The
    // labels say who prepared the report; they deliberately do not say
    // approved, accepted or certified, because this document is a contractor's
    // record of what happened and not a client's agreement to it.
    // Kept deliberately short. It is a footer to the document rather than a
    // section of it, and a taller block pushed one-page reports onto a second
    // page for the sake of three ruled lines.
    signOff: {
      marginTop: roomy ? 14 : 11,
      borderTopWidth: 0.75,
      borderTopColor: c.rule,
      paddingTop: 7,
    },
    signOffRow: { flexDirection: "row" },
    signOffCell: { width: "33.33%", paddingRight: 16 },
    signOffLabel: {
      fontSize: 7,
      color: c.faint,
      letterSpacing: 0.9,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    signOffValue: { fontSize: 9, color: c.ink, lineHeight: 1.3 },
    /** The line somebody writes on. */
    signOffLine: { marginTop: 11, borderBottomWidth: 0.75, borderBottomColor: c.charcoal },
    signOffNote: { fontSize: 6.5, color: c.faint, marginTop: 6, lineHeight: 1.35 },

    // ---- running footer ---------------------------------------------------
    footer: {
      position: "absolute",
      bottom: 22,
      left: PAGE_MARGIN,
      right: PAGE_MARGIN,
      borderTopWidth: 0.75,
      borderTopColor: c.line,
      paddingTop: 5,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7.5,
      color: c.faint,
    },
    footerCell: { flex: 1 },
    footerMiddle: { flex: 1, textAlign: "center" },
    footerRight: { flex: 1, textAlign: "right" },
  });
}

export type PdfStyles = ReturnType<typeof createPdfStyles>;
