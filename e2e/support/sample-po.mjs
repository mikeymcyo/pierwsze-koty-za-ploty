/**
 * A synthetic Store 1848 purchase order, built at test time.
 *
 * Deliberately not a fixture file: the extraction check compares the model's
 * quotes against what pdfjs reads out of a real PDF, so the test has to run
 * against real PDF bytes or it is testing nothing. pdf-lib already ships with
 * the app for the document package, so building one costs no new dependency.
 *
 * The content is the shape that matters to this product and to nobody's live
 * data: a brief spoken first, a purchase order arriving later, instructed work
 * beside quoted work, and requirements that must not be embellished.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";

export const PO_PAGE_ONE = [
  "LIDL GB LIMITED",
  "PURCHASE ORDER",
  "",
  "Order number: 4501234567",
  "Order date: 1 September 2026",
  "Site: Store 1848, Bakery and Warehouse",
  "Supplier: Northgate Maintenance Ltd",
  "Contact: R. Whitfield, Store Manager",
];

export const PO_PAGE_TWO = [
  "SCOPE OF WORKS",
  "",
  "1. Repair the leaking bakery sink, including replacement of",
  "   the trap and waste connection.",
  "2. Rectify the warehouse doors so that both leaves close and",
  "   latch correctly.",
  "",
  "QUOTATION ONLY - NOT INSTRUCTED",
  "",
  "3. Replacement of the bakery floor covering, quoted at",
  "   4,250.00 GBP. This item is not instructed and must not be",
  "   carried out without a further written order.",
  "",
  "CONDITIONS",
  "",
  "All operatives to hold a valid CSCS card.",
  "Works to be carried out outside trading hours.",
  "The store must be left clean and trading safe each night.",
];

/** The bytes of the order, as if somebody had uploaded it. */
export async function buildSamplePurchaseOrder() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const lines of [PO_PAGE_ONE, PO_PAGE_TWO]) {
    const page = pdf.addPage([595, 842]);
    let y = 780;
    for (const line of lines) {
      if (line) page.drawText(line, { x: 56, y, size: 11, font });
      y -= 18;
    }
  }

  return new Uint8Array(await pdf.save());
}
