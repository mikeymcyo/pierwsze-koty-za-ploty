import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";

import { SummaryReportDocument, type SummaryPdfData } from "@/lib/pdf/summary-document";

export async function renderSummaryReportPdf(data: SummaryPdfData): Promise<Buffer> {
  const document = createElement(SummaryReportDocument, { data }) as ReactElement<DocumentProps>;
  return renderToBuffer(document);
}
