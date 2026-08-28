import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";

import { ReportDocument, type ReportPdfData } from "@/lib/pdf/report-document";

/**
 * Renders the report to PDF bytes.
 *
 * Separated from the document so the layout can be rendered in a test without
 * dragging "server-only" along with it, and so the finalise action and the
 * draft preview share one renderer rather than drifting apart.
 */
export async function renderReportPdf(data: ReportPdfData): Promise<Buffer> {
  // renderToBuffer is typed against a <Document> element specifically, and
  // ReportDocument is a component that returns one. The cast asserts that
  // relationship, which the compiler cannot see through a wrapper.
  const document = createElement(ReportDocument, { data }) as ReactElement<DocumentProps>;
  return renderToBuffer(document);
}
