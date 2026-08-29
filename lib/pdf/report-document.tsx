import { Fragment } from "react";

import { Document, Page, Text } from "@react-pdf/renderer";

import type { IssuePriority, ReportSectionType } from "@/types/database";
import type { ResolvedDocument } from "@/lib/documents/metadata";
import { photoPrintLabel, photoPrintLabelText } from "@/lib/photo-captions";
import {
  ControlPanel,
  CoverPhoto,
  DataTable,
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

/**
 * The client-ready daily report.
 *
 * This is the thing the whole product exists to produce: it goes to a client,
 * it carries the site manager's name, and it can be read back in a dispute a
 * year later. So it is laid out as a document rather than a dump of the
 * database - a running header and footer, a document-control panel, titled
 * sections in their proper order, an issue record, and numbered photographic
 * plates with their captions attached.
 *
 * The parts themselves live in lib/pdf/components.tsx and the sizes and
 * colours in lib/pdf/theme.ts, shared with the Progress and Completion
 * Reports, because a client who receives all three should recognise them as
 * one contractor's paperwork. This one takes the compact theme: a daily report
 * is read the day after it is written and earns its keep by being short.
 *
 * It takes plain data and no Supabase client, so it renders in a test with
 * fixtures as easily as it does in the finalise action. Photo bytes are passed
 * in already downloaded rather than fetched from here: a signed URL can expire
 * mid-render, and an issued record must not depend on the network holding up
 * at the moment somebody presses the button.
 */

export type PdfPhoto = {
  id: string;
  caption: string | null;
  category: string;
  /** Already-downloaded bytes. A photo that could not be read is left out. */
  data: Buffer;
};

export type PdfIssue = {
  id: string;
  title: string;
  description: string | null;
  responsible: string | null;
  priority: IssuePriority;
  statusLabel: string;
  priorityLabel: string;
};

export type ReportPdfData = {
  companyName: string;
  projectName: string;
  client: string | null;
  siteAddress: string | null;
  projectReference: string | null;
  reportNumber: string;
  reportDate: string;
  weather: string | null;
  authorName: string | null;
  finalisedAt: string;
  workforce: { company_name: string; trade: string | null; operatives: number }[];
  plant: { description: string; quantity: number }[];
  sections: { type: ReportSectionType; label: string; content: string }[];
  issues: PdfIssue[];
  photos: PdfPhoto[];
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
   * The photograph to open on, chosen from `photos` above. Null - and no
   * cover - is the default and an entirely valid document.
   */
  coverPhotoId?: string | null;
};

/** "P01-P08", so the section says up front what it contains. */
function plateRange(count: number): string | undefined {
  if (count < 2) return undefined;
  return `${photoReference(0)}-${photoReference(count - 1)}`;
}

export function ReportDocument({ data }: { data: ReportPdfData }) {
  // Built per render rather than at module load, because the style is now the
  // user's choice at the moment they issue the report.
  const theme = pdfTheme(data.style, "compact");
  const s = createPdfStyles(theme);
  const c = theme.colors;

  const documentType = "Site Progress Report";
  const documentLabel = `${documentType} No. ${data.reportNumber}`;
  const cover = pickCoverPhoto(data.photos, data.coverPhotoId);

  return (
    <Document
      title={`${documentLabel} - ${data.projectName}`}
      author={data.authorName ?? data.companyName}
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
          number={data.reportNumber}
          projectName={data.projectName}
          context={[data.client, data.siteAddress]}
        />

        <ControlPanel
          s={s}
          items={[
            { label: "Report date", value: data.reportDate },
            // The store, where the project is linked to one. It sits beside
            // the project reference rather than replacing it: one names the
            // building, the other names this package of works.
            { label: "Store", value: storeLine(data.store) },
            { label: "Project reference", value: data.projectReference },
            { label: "Weather", value: data.weather },
            { label: "Reported by", value: data.authorName },
            { label: "Issued", value: data.finalisedAt },
          ]}
        />

        {/* The written report. Sections arrive in REPORT_SECTION_ORDER and any
            the notes did not support were never generated, so nothing here is
            padded to fill a heading. */}
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

        <>
          <SectionHeading s={s}>Workforce on site</SectionHeading>
          {data.workforce.length === 0 ? (
            <Text style={s.empty}>None recorded.</Text>
          ) : (
            <DataTable
              s={s}
              columns={[
                { key: "company", label: "Company", width: "50%" },
                { key: "trade", label: "Trade", width: "32%" },
                { key: "operatives", label: "Operatives", width: "18%", numeric: true },
              ]}
              rows={data.workforce.map((row, index) => ({
                key: `${row.company_name}-${index}`,
                cells: [row.company_name, row.trade ?? "-", row.operatives],
              }))}
            />
          )}
        </>

        <>
          <SectionHeading s={s}>Plant and equipment</SectionHeading>
          {data.plant.length === 0 ? (
            <Text style={s.empty}>None recorded.</Text>
          ) : (
            <DataTable
              s={s}
              columns={[
                { key: "description", label: "Description", width: "82%" },
                { key: "quantity", label: "Quantity", width: "18%", numeric: true },
              ]}
              rows={data.plant.map((row, index) => ({
                key: `${row.description}-${index}`,
                cells: [row.description, row.quantity],
              }))}
            />
          )}
        </>

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
          // No page break. Forcing one here ended whatever preceded it - often
          // a single short issue - halfway up a page and left the rest blank.
          // The grid flows, and each plate still holds its image and caption
          // together.
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

        <SignOff s={s} preparedBy={data.authorName} />

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
