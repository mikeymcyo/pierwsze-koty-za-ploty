import { Fragment } from "react";

import { Document, Page, Text } from "@react-pdf/renderer";

import type { IssuePriority, SummaryReportKind, SummarySectionType } from "@/types/database";
import type { ResolvedDocument } from "@/lib/documents/metadata";
import { photoPrintLabel, photoPrintLabelText } from "@/lib/photo-captions";
import {
  ControlPanel,
  CoverPhoto,
  DocumentRegister,
  DocumentTitle,
  IssueRecord,
  PhotoGrid,
  RunningFooter,
  RunningHeader,
  SectionHeading,
  SignOff,
  issueReserve,
  plateReserve,
  priorityColour,
} from "@/lib/pdf/components";
import { photoReference } from "@/lib/pdf/photo-evidence";
import { pickCoverPhoto, type PdfStyle } from "@/lib/pdf/presentation";
import { storeLine } from "@/lib/reports/site-identity";
import { createPdfStyles, pdfTheme } from "@/lib/pdf/theme";
import {
  SUMMARY_DOCUMENT_TITLES,
  isSurvey,
  summaryPeriodFieldLabel,
} from "@/lib/summary-reports/sections";

/**
 * The consolidated report: Progress, and Completion.
 *
 * Built from the same parts as the Daily Report - see lib/pdf/components.tsx
 * and lib/pdf/theme.ts - so the three arrive at a client as one contractor's
 * paperwork rather than as three different templates. What differs is density
 * and weight, which is the real difference between the documents: a Progress
 * Report is a periodic management submission, and a Completion Report is the
 * record of the job, so it opens harder.
 *
 * Every figure printed here was frozen when the report was issued. The issue
 * record carries the status and resolution as they stood at that moment, and
 * the document register carries each drawing as it was then, so nothing
 * changing on the project afterwards can alter what this document says.
 */

export type SummaryPdfData = {
  kind: SummaryReportKind;
  companyName: string;
  projectName: string;
  client: string | null;
  siteAddress: string | null;
  projectReference: string | null;
  title: string | null;
  number: string;
  revision: number;
  periodLabel: string;
  issuedAt: string;
  issuedBy: string;
  sections: { type: SummarySectionType; label: string; content: string }[];
  issues: {
    id: string;
    title: string;
    description: string | null;
    responsible: string | null;
    priority: IssuePriority;
    priorityLabel: string;
    statusLabel: string;
    resolution: string | null;
  }[];
  photos: {
    id: string;
    caption: string | null;
    category: string;
    data: Buffer;
  }[];
  sourceLabels: string[];
  supportingDocuments: ResolvedDocument[];
  /** Whether the listed documents follow as appendices, so the register says so. */
  documentsAppended: boolean;
  /**
   * The client's own name for the place, where the project is linked to one.
   * Null on a project entered by hand, which prints exactly as it always did.
   */
  store: { name: string; code: string } | null;
  /**
   * Which of the three export styles to print in. Absent means the house
   * style, so every existing caller and fixture prints exactly as before.
   */
  style?: PdfStyle;
  /**
   * The photograph to open on, chosen from `photos` above - which on a
   * consolidated report is the curated set. Null, and no cover, is the
   * default and an entirely valid document.
   */
  coverPhotoId?: string | null;
};

/** "P01-P12", so the section says up front what it contains. */
function plateRange(count: number): string | undefined {
  if (count < 2) return undefined;
  return `${photoReference(0)}-${photoReference(count - 1)}`;
}

export function SummaryReportDocument({ data }: { data: SummaryPdfData }) {
  // Built per render rather than at module load, because the style is now the
  // user's choice at the moment they issue the report.
  const theme = pdfTheme(data.style, "standard");
  const s = createPdfStyles(theme);
  const c = theme.colors;
  const cover = pickCoverPhoto(data.photos, data.coverPhotoId);

  const completion = data.kind === "completion";
  const survey = isSurvey(data.kind);
  const documentType = SUMMARY_DOCUMENT_TITLES[data.kind];
  const documentLabel = `${documentType} No. ${data.number}${
    data.revision ? ` Rev ${data.revision}` : ""
  }`;

  return (
    <Document
      title={`${documentLabel} - ${data.projectName}`}
      author={data.issuedBy}
      subject={data.projectName}
      creator={theme.productName}
      producer={theme.productName}
    >
      <Page size="A4" style={s.page}>
        <RunningHeader s={s} productName={theme.productName} companyName={data.companyName} />

        {/* The cover, where one was chosen: one of the plates below, printed
            large at the head of the first page. It is still shown in the
            evidence grid with its P-reference, because that is the record. */}
        {cover ? (
          <CoverPhoto
            s={s}
            data={cover.data}
            maxHeight={theme.cover.maxHeight}
            caption={photoPrintLabelText(cover)}
          />
        ) : null}

        <DocumentTitle
          s={s}
          documentType={documentType}
          number={data.number}
          projectName={data.projectName}
          context={[data.client, data.siteAddress]}
          // The Completion Report opens harder because it is the document the
          // job is remembered by. A stronger title block, not a cover sheet -
          // a page carrying six words would be the wrong kind of impressive.
          large={completion || survey}
        />

        <ControlPanel
          s={s}
          items={[
            // Only a title somebody wrote. The document already names itself
            // in letters twice this size directly above, and repeating it
            // here would spend a line of the control panel saying nothing.
            { label: "Title", value: data.title },
            { label: summaryPeriodFieldLabel(data.kind), value: data.periodLabel },
            { label: "Store", value: storeLine(data.store) },
            { label: "Project reference", value: data.projectReference },
            { label: "Revision", value: data.revision ? String(data.revision) : null },
            { label: "Issued", value: data.issuedAt },
            { label: "Issued by", value: data.issuedBy },
          ]}
        />

        {/* Fragments, not Views. react-pdf only honours minPresenceAhead on
            a direct child of the Page, so a section wrapped in its own View
            has headings that cannot reserve room and get stranded at the foot
            of a page with their content overleaf. */}
        {data.sections.map((section) => (
          <Fragment key={section.type}>
            <SectionHeading s={s}>{section.label}</SectionHeading>
            <Text style={s.paragraph}>{section.content}</Text>
          </Fragment>
        ))}

        {data.issues.length > 0 ? (
          <>
            {/* The heading reserves room for the record that follows it. A
                heading left alone at the foot of a page, with its first issue
                overleaf, is exactly the fault this batch set out to remove. */}
            <SectionHeading s={s} reserve={issueReserve(data.issues[0])}>
              Issues
            </SectionHeading>
            {data.issues.map((issue) => (
              <IssueRecord
                key={issue.id}
                s={s}
                issue={issue}
                colour={priorityColour(issue.priority, c.charcoal)}
                inverse={c.inverse}
              />
            ))}
          </>
        ) : null}

        {data.supportingDocuments.length > 0 ? (
          <>
            <SectionHeading s={s} reserve={62}>
              Supporting documents
            </SectionHeading>
            <DocumentRegister
              s={s}
              rows={data.supportingDocuments}
              appended={data.documentsAppended}
            />
          </>
        ) : null}

        {data.photos.length > 0 ? (
          // No page break - see report-document.tsx. It stranded short issue
          // records at the top of an otherwise empty page.
          <>
            <SectionHeading
              s={s}
              reserve={plateReserve(data.photos[0].data, theme.plate)}
              note={plateRange(data.photos.length)}
            >
              Photographic evidence
            </SectionHeading>
            <PhotoGrid
              s={s}
              bounds={theme.plate}
              photos={data.photos.map((photo) => ({
                id: photo.id,
                label: photoPrintLabel(photo),
                data: photo.data,
              }))}
            />
          </>
        ) : null}

        {/* A survey has no source record: it is written from a visit, not
            consolidated from issued reports. Printing an empty heading would
            imply evidence that does not exist. */}
        {data.sourceLabels.length > 0 ? (
          <>
            <SectionHeading s={s}>Source record</SectionHeading>
            {data.sourceLabels.map((source) => (
              <Text key={source} style={s.sourceLine}>
                {source}
              </Text>
            ))}
          </>
        ) : null}

        <SignOff s={s} preparedBy={data.issuedBy} />

        <RunningFooter
          s={s}
          companyName={data.companyName}
          projectName={data.projectName}
          documentLabel={documentLabel}
        />
      </Page>
    </Document>
  );
}
