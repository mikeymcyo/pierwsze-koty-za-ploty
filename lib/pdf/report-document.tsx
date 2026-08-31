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
  GroupedProse,
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
import { APPENDIX_LABEL, appendixNote, groupSections } from "@/lib/report-structure";

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
  /**
   * Quarter turns applied while drawing. Absent on every photograph nobody has
   * turned, which prints exactly as it always did.
   */
  rotation?: number;
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
  const groups = groupSections("daily", data.sections);

  // Workforce and plant always print, even as "None recorded" - on a daily
  // report their absence is itself a fact about the day. The appendix appears
  // whenever there is anything at all to put in it.
  const hasAppendix =
    data.workforce.length > 0 || data.plant.length > 0 || data.supportingDocuments.length > 0;

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
            rotation={cover.rotation}
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

        {/* Three sections, and no more. What a client wants from a daily
            report is what happened, what it looked like, and what is still
            open - not thirteen headings. The stored sections are all still
            here: each is a paragraph under the group it belongs to, opening
            with its own name so the difference between completed and planned
            work stays on the page. See lib/report-structure.ts. */}
        {/* Fragments, not Views. react-pdf only honours minPresenceAhead on
            a direct child of the Page, so a section wrapped in its own View
            has headings that cannot reserve room and get stranded at the foot
            of a page with their content overleaf. */}
        {groups.map(({ group, entries }) => {
          const photos = group.key === "evidence" ? data.photos : [];
          const issues = group.key === "outstanding" ? data.issues : [];
          // A heading with nothing under it reads as an omission rather than
          // as an honest silence, so a group with no prose, no plates and no
          // issues is not printed at all.
          if (entries.length === 0 && photos.length === 0 && issues.length === 0) return null;

          // The heading reserves room for whatever follows it. A heading left
          // alone at the foot of a page, with its first plate or issue
          // overleaf, is exactly the fault the layout works to avoid.
          const reserve =
            entries.length > 0
              ? 48
              : photos.length > 0
                ? plateReserve(photos[0].data, theme.plate, photos[0].rotation)
                : issues.length > 0
                  ? issueReserve(issues[0])
                  : 48;

          return (
            <Fragment key={group.key}>
              <SectionHeading
                s={s}
                reserve={reserve}
                note={photos.length > 0 ? plateRange(photos.length) : undefined}
              >
                {group.label}
              </SectionHeading>

              <GroupedProse s={s} group={group} entries={entries} />

              {issues.map((issue) => (
                <IssueRecord
                  key={issue.id}
                  s={s}
                  issue={issue}
                  colour={priorityColour(issue.priority, c.charcoal)}
                  inverse={c.inverse}
                />
              ))}

              {photos.length > 0 ? (
                // No page break. Forcing one here ended whatever preceded it -
                // often a single short issue - halfway up a page and left the
                // rest blank. The grid flows, and each plate still holds its
                // image and caption together.
                <PhotoGrid
                  s={s}
                  bounds={theme.plate}
                  photos={photos.map((photo) => ({
                    id: photo.id,
                    label: photoPrintLabel(photo),
                    data: photo.data,
                    rotation: photo.rotation,
                  }))}
                />
              ) : null}
            </Fragment>
          );
        })}

        {/* The recorded data, out of the way but not out of the document.
            Who was on site, what plant was there and which documents this was
            issued against are all still printed in full - they are simply not
            competing with the report for a reader's attention. */}
        {hasAppendix ? (
          <>
            <SectionHeading
              s={s}
              reserve={70}
              note={appendixNote({
                workforce: data.workforce.length > 0,
                plant: data.plant.length > 0,
                documents: data.supportingDocuments.length > 0,
              })}
            >
              {APPENDIX_LABEL}
            </SectionHeading>

            <Text style={s.recordLabel}>Workforce on site</Text>
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

            <Text style={s.recordLabel}>Plant and equipment</Text>
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

            {data.supportingDocuments.length > 0 ? (
              <>
                <Text style={s.recordLabel}>Supporting documents</Text>
                <DocumentRegister
                  s={s}
                  rows={data.supportingDocuments}
                  appended={data.documentsAppended}
                />
              </>
            ) : null}
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
