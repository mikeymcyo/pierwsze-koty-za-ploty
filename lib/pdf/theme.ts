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

export type PdfTheme = {
  /** The product's own identity, printed top-left on every page. */
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
};

export const defaultPdfTheme: PdfTheme = {
  productName: "SiteBoss Pro",
  colors: {
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
  density: "standard",
};

/** The same system, tightened. Used by the Daily Report. */
export const compactPdfTheme: PdfTheme = { ...defaultPdfTheme, density: "compact" };

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
    headerBrand: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      color: c.ink,
    },
    headerCompany: { fontSize: 8.5, color: c.muted, letterSpacing: 0.2 },
    // A short amber stub against a full charcoal rule: the accent is a mark on
    // the page, never a band across it.
    rule: { flexDirection: "row", height: 2 },
    ruleAccent: { width: 44, backgroundColor: c.accent },
    ruleRest: { flex: 1, backgroundColor: c.rule },

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
    photoCaption: { fontSize: 8.5, color: c.ink, lineHeight: 1.35 },
    photoNoCaption: { fontSize: 8.5, color: c.faint, fontStyle: "italic" },

    // ---- source record ----------------------------------------------------
    sourceLine: { fontSize: 8.5, color: c.muted, marginBottom: 1.5, lineHeight: 1.35 },

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
