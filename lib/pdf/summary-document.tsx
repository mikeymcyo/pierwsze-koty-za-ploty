import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { IssuePriority, SummaryReportKind, SummarySectionType } from "@/types/database";
import { photoPrintLabel } from "@/lib/photo-captions";

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
};

const INK = "#1a1a1a";
const MUTED = "#5c5c5c";
const LINE = "#d4d4d4";

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
    borderBottomColor: INK,
    paddingBottom: 8,
    marginBottom: 16,
  },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  company: { fontSize: 9, color: MUTED },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 11, color: MUTED, marginBottom: 14 },
  details: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderTopColor: LINE },
  detail: {
    width: "50%",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 5,
    paddingRight: 10,
  },
  detailLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  heading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  paragraph: { marginBottom: 4 },
  issue: { borderLeftWidth: 3, borderLeftColor: LINE, paddingLeft: 8, marginBottom: 9 },
  issueTitle: { fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  resolution: { marginTop: 3 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  photo: { width: "50%", paddingRight: 10, paddingBottom: 12 },
  // contain, not cover - see report-document.tsx.
  photoImage: { width: "100%", height: 150, objectFit: "contain", marginBottom: 4 },
  source: { fontSize: 8, color: MUTED, marginBottom: 2 },
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export function SummaryReportDocument({ data }: { data: SummaryPdfData }) {
  const kindLabel = data.kind === "progress" ? "Progress Report" : "Completion Report";
  const numbered = `${kindLabel} ${data.number}${data.revision ? ` · Revision ${data.revision}` : ""}`;

  return (
    <Document
      title={`${numbered} - ${data.projectName}`}
      author={data.issuedBy}
      subject={data.projectName}
      creator="SiteBoss Pro"
      producer="SiteBoss Pro"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} fixed>
          <Text style={styles.brand}>SiteBoss Pro</Text>
          <Text style={styles.company}>{data.companyName}</Text>
        </View>

        <Text style={styles.title}>{data.title || numbered}</Text>
        <Text style={styles.subtitle}>
          {[data.projectName, data.client].filter(Boolean).join(" · ")}
        </Text>

        <View style={styles.details}>
          <Detail label="Document" value={numbered} />
          <Detail label="Reporting period" value={data.periodLabel} />
          {data.siteAddress ? <Detail label="Site" value={data.siteAddress} /> : null}
          {data.projectReference ? <Detail label="Project reference" value={data.projectReference} /> : null}
          <Detail label="Issued" value={data.issuedAt} />
          <Detail label="Issued by" value={data.issuedBy} />
        </View>

        {data.sections.map((section) => (
          <View key={section.type} wrap={false}>
            <Text style={styles.heading}>{section.label}</Text>
            <Text style={styles.paragraph}>{section.content}</Text>
          </View>
        ))}

        {data.issues.length > 0 ? (
          <View>
            <Text style={styles.heading}>Issue record</Text>
            {data.issues.map((issue) => (
              <View key={issue.id} style={styles.issue} wrap={false}>
                <Text style={styles.issueTitle}>{issue.title}</Text>
                <Text style={styles.meta}>
                  {[issue.priorityLabel, issue.statusLabel, issue.responsible].filter(Boolean).join(" · ")}
                </Text>
                {issue.description ? <Text>{issue.description}</Text> : null}
                {issue.resolution ? (
                  <Text style={styles.resolution}>Resolution: {issue.resolution}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {data.photos.length > 0 ? (
          <View break>
            <Text style={styles.heading}>Photographic record</Text>
            <View style={styles.photoGrid}>
              {data.photos.map((photo) => (
                <View key={photo.id} style={styles.photo} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image style={styles.photoImage} src={photo.data} />
                  {photoPrintLabel(photo).status ? (
                    <Text style={styles.meta}>{photoPrintLabel(photo).status}</Text>
                  ) : null}
                  {photoPrintLabel(photo).caption ? (
                    <Text>{photoPrintLabel(photo).caption}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View>
          <Text style={styles.heading}>Source record</Text>
          {data.sourceLabels.map((source) => (
            <Text key={source} style={styles.source}>• {source}</Text>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.projectName} · {numbered}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
