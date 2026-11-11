/** Shared limits and checks for the PO picker and inline viewer. */
export const MAX_PO_PDF_BYTES = 25 * 1024 * 1024;

export async function validatePoPdf(file: Blob): Promise<string | null> {
  if (file.size === 0) return "Choose a PDF that is not empty.";
  if (file.size > MAX_PO_PDF_BYTES) return "Choose a PDF smaller than 25 MB.";
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...header) === "%PDF-" ? null : "Choose a PDF file.";
}

/** PO numbers can come from imports; never put raw text into a header. */
export function poPdfFilename(poNumber: string): string {
  return `PO ${poNumber.replace(/[^a-zA-Z0-9 _.-]/g, "_").slice(0, 100) || "document"}.pdf`;
}
