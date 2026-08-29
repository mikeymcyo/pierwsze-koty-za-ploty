import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { IssuePriority, ReportSectionType } from "@/types/database";
import {
  DOCUMENT_COLUMN_LABELS,
  documentCell,
  visibleDocumentColumns,
  type ResolvedDocument,
} from "@/lib/documents/metadata";
import { photoPrintLabel } from "@/lib/photo-captions";

/**
 * The client-ready progress report.
 *
 * This is the thing the whole product exists to produce: it goes to a client,
 * it carries the site manager's name, and it can be read back in a dispute a
 * year later. So it is laid out as a document rather than a dump of the
 * database - a titled header block, labelled tables, the written sections in
 * their proper order, and photographs with their captions attached to them.
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
};

const INK = "#1a1a1a";
const MUTED = "#5c5c5c";
const LINE = "#d4d4d4";
const BRAND = "#111111";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 10,
    color: INK,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  brandBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 8,
    marginBottom: 16,
  },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  brandSub: { fontSize: 9, color: MUTED },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 11, color: MUTED, marginBottom: 14 },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: LINE,
    marginBottom: 18,
  },
  detail: {
    width: "50%",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 5,
    paddingRight: 10,
  },
  detailLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  detailValue: { fontSize: 10 },
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  body: { marginBottom: 4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 4,
  },
  tableHead: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED, textTransform: "uppercase" },
  colWide: { flex: 3 },
  colMid: { flex: 2 },
  colNarrow: { flex: 1, textAlign: "right" },
  issue: {
    borderLeftWidth: 3,
    borderLeftColor: LINE,
    paddingLeft: 8,
    marginBottom: 8,
  },
  issueTitle: { fontFamily: "Helvetica-Bold" },
  issueMeta: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  photoCell: { width: "50%", paddingRight: 10, paddingBottom: 12 },
  // contain, not cover: a cropped photograph can cut out the very thing it
  // was taken to evidence. The whole frame is printed, aspect ratio intact.
  photoImage: { width: "100%", height: 150, objectFit: "contain", marginBottom: 4 },
  // No longer shouted in capitals: it sits beside a caption now rather than
  // standing in for one.
  photoCategory: { fontSize: 8, color: MUTED, letterSpacing: 0.5 },
  photoCaption: { fontSize: 9 },
  empty: { color: MUTED, fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
    fontSize: 8,
    color: MUTED,
  },
});

const PRIORITY_COLOURS: Record<IssuePriority, string> = {
  low: "#8a8a8a",
  medium: "#3b6fb5",
  high: "#b5711f",
  critical: "#b3261e",
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function ReportDocument({ data }: { data: ReportPdfData }) {
  const title = `Site Progress Report ${data.reportNumber}`;

  return (
    <Document
      title={`${title} - ${data.projectName}`}
      author={data.authorName ?? data.companyName}
      subject={data.projectName}
      creator="SiteBoss Pro"
      producer="SiteBoss Pro"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} fixed>
          <Text style={styles.brand}>SiteBoss Pro</Text>
          <Text style={styles.brandSub}>{data.companyName}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {[data.projectName, data.client].filter(Boolean).join(" · ")}
        </Text>

        <View style={styles.detailGrid}>
          <Detail label="Date" value={data.reportDate} />
          <Detail label="Report number" value={data.reportNumber} />
          {data.siteAddress ? <Detail label="Site" value={data.siteAddress} /> : null}
          {data.projectReference ? (
            <Detail label="Project reference" value={data.projectReference} />
          ) : null}
          {data.client ? <Detail label="Client" value={data.client} /> : null}
          {data.weather ? <Detail label="Weather" value={data.weather} /> : null}
          {data.authorName ? <Detail label="Reported by" value={data.authorName} /> : null}
          <Detail label="Issued" value={data.finalisedAt} />
        </View>

        {/* The written report. Sections arrive in REPORT_SECTION_ORDER and any
            the notes did not support were never generated, so nothing here is
            padded to fill a heading. */}
        {data.sections.map((section) => (
          <View key={section.type}>
            <Text style={styles.sectionHeading} minPresenceAhead={48}>
              {section.label}
            </Text>
            <Text style={styles.body}>{section.content}</Text>
          </View>
        ))}

        <View>
          <Text style={styles.sectionHeading} minPresenceAhead={48}>
            Workforce on site
          </Text>
          {data.workforce.length === 0 ? (
            <Text style={styles.empty}>None recorded.</Text>
          ) : (
            <>
              <View style={styles.tableRow}>
                <Text style={[styles.tableHead, styles.colWide]}>Company</Text>
                <Text style={[styles.tableHead, styles.colMid]}>Trade</Text>
                <Text style={[styles.tableHead, styles.colNarrow]}>Operatives</Text>
              </View>
              {data.workforce.map((row, index) => (
                <View style={styles.tableRow} key={`${row.company_name}-${index}`}>
                  <Text style={styles.colWide}>{row.company_name}</Text>
                  <Text style={styles.colMid}>{row.trade ?? "—"}</Text>
                  <Text style={styles.colNarrow}>{row.operatives}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        <View>
          <Text style={styles.sectionHeading} minPresenceAhead={48}>
            Plant and equipment
          </Text>
          {data.plant.length === 0 ? (
            <Text style={styles.empty}>None recorded.</Text>
          ) : (
            <>
              <View style={styles.tableRow}>
                <Text style={[styles.tableHead, styles.colWide]}>Description</Text>
                <Text style={[styles.tableHead, styles.colNarrow]}>Quantity</Text>
              </View>
              {data.plant.map((row, index) => (
                <View style={styles.tableRow} key={`${row.description}-${index}`}>
                  <Text style={styles.colWide}>{row.description}</Text>
                  <Text style={styles.colNarrow}>{row.quantity}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {data.issues.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading} minPresenceAhead={48}>
              Issues raised
            </Text>
            {data.issues.map((issue) => (
              <View key={issue.id} style={styles.issue} wrap={false}>
                <Text style={styles.issueTitle}>{issue.title}</Text>
                <Text style={[styles.issueMeta, { color: PRIORITY_COLOURS[issue.priority] }]}>
                  {[issue.priorityLabel, issue.statusLabel, issue.responsible]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {issue.description ? <Text>{issue.description}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {data.supportingDocuments.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading} minPresenceAhead={48}>
              Supporting documents
            </Text>
            <DocumentTable rows={data.supportingDocuments} />
          </View>
        ) : null}

        {data.photos.length > 0 ? (
          // No page break. Forcing one here ended whatever preceded it - often
          // a single short issue - halfway up a page and left the rest blank.
          // The grid flows, and each cell still holds its image and caption
          // together.
          <View>
            <Text style={styles.sectionHeading} minPresenceAhead={90}>
              Photographs
            </Text>
            <View style={styles.photoGrid}>
              {data.photos.map((photo) => (
                // wrap={false} keeps an image and its caption together: a
                // caption stranded at the top of the next page belongs to a
                // photograph the reader can no longer see.
                <View key={photo.id} style={styles.photoCell} wrap={false}>
                  {/* react-pdf's Image is not an HTML img and takes no alt -
                      the caption below it is what a reader gets. */}
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image style={styles.photoImage} src={photo.data} />
                  {/* The caption leads; the status appears only when it says
                      something the caption does not. */}
                  {photoPrintLabel(photo).status ? (
                    <Text style={styles.photoCategory}>{photoPrintLabel(photo).status}</Text>
                  ) : null}
                  {photoPrintLabel(photo).caption ? (
                    <Text style={styles.photoCaption}>{photoPrintLabel(photo).caption}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            {data.projectName} · {title}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/**
 * The documents this report was issued against.
 *
 * Reference, revision and date are optional on every document, so a column
 * appears only when at least one row has something to put in it - five blank
 * cells tell the reader nothing and make the table look like a fault.
 */
function DocumentTable({ rows }: { rows: ResolvedDocument[] }) {
  const columns = visibleDocumentColumns(rows);
  const width = `${100 / columns.length}%`;
  return (
    <>
      <View style={styles.tableRow}>
        {columns.map((column) => (
          <Text key={column} style={[styles.tableHead, { width }]}>
            {DOCUMENT_COLUMN_LABELS[column]}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View style={styles.tableRow} key={`${row.title}-${index}`} wrap={false}>
          {columns.map((column) => (
            <Text key={column} style={{ width }}>
              {documentCell(row, column)}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}
