/**
 * The pieces every SiteBoss report is built from.
 *
 * Daily, Progress and Completion Reports had grown their own copies of the
 * same header, the same table, the same issue block and the same footer, and
 * they had started to disagree with each other. These are the shared parts, so
 * a change to how a table reads happens once and reaches all three.
 *
 * Every component takes its stylesheet as `s`. That is the theming seam: the
 * Daily Report passes a tighter one, and a per-company theme later passes a
 * different one again, without a single colour or size being written into the
 * JSX below.
 */

import { Image, Text, View } from "@react-pdf/renderer";

import type { IssuePriority } from "@/types/database";
import {
  DOCUMENT_COLUMN_LABELS,
  documentCell,
  visibleDocumentColumns,
  type ResolvedDocument,
} from "@/lib/documents/metadata";
import { fitBox, imageSize, photoBoxHeight, photoBoxSize } from "@/lib/pdf/image-size";
import { photoEvidence, type PhotoEvidenceItem } from "@/lib/pdf/photo-evidence";
import { isQuarterTurn, normaliseRotation, rotatedSize } from "@/lib/photos-rotation";
import { runInLabel, type ReportGroup } from "@/lib/report-structure";
import type { PdfStyles } from "@/lib/pdf/theme";

/**
 * A4 less the page margins, less the column gutter and the plate's own frame.
 * Fixed rather than measured because react-pdf cannot report a laid-out width
 * back to us, and the grid it feeds is a fixed two columns.
 */
export const PHOTO_COLUMN_WIDTH = 238;

/** A4 less the two 40pt page margins: the width of everything on the page. */
export const CONTENT_WIDTH = 515;

/** The bounds a plate is printed between, which the Photo style widens. */
export type PlateBounds = { min: number; max: number };

/**
 * Muted on purpose. A report where every issue shouts stops distinguishing
 * between them, and these sit next to black text on white paper.
 */
const PRIORITY_COLOURS: Record<IssuePriority, string> = {
  low: "#71717a",
  medium: "#3f6212",
  high: "#b45309",
  critical: "#b91c1c",
};

export function priorityColour(priority: IssuePriority, fallback: string): string {
  return PRIORITY_COLOURS[priority] ?? fallback;
}

/** The rule with its short accent stub. The only place the accent spans. */
export function Rule({ s }: { s: PdfStyles }) {
  return (
    <View style={s.rule}>
      <View style={s.ruleAccent} />
      <View style={s.ruleRest} />
    </View>
  );
}

/**
 * The running header: the company whose report this is, then the product.
 *
 * Repeated on every page (`fixed`) so a page separated from the rest still
 * says who issued it, and small enough that the content stays the subject.
 */
export function RunningHeader({
  s,
  productName,
  companyName,
}: {
  s: PdfStyles;
  productName: string;
  companyName: string;
}) {
  return (
    <View style={s.header} fixed>
      <View style={s.headerRow}>
        {/* The contractor's name reads first and the product's second, both
            small. A client's document should carry the client's contractor at
            its head, not ours - see headerBrand in lib/pdf/theme.ts. */}
        <Text style={s.headerCompany}>{companyName}</Text>
        <Text style={s.headerBrand}>{productName}</Text>
      </View>
      <Rule s={s} />
    </View>
  );
}

/**
 * The cover photograph, where one was chosen.
 *
 * One of the report's own plates, printed at the head of the first page at its
 * own shape and its own bytes - see fitBox. How much room it gets is the
 * style's decision: a band in SiteBoss and Corporate, a third of the page in
 * Photo.
 *
 * No cover is an ordinary answer and the default one, so this renders nothing
 * rather than a placeholder.
 */
export function CoverPhoto({
  s,
  data,
  maxHeight,
  caption,
  rotation = 0,
}: {
  s: PdfStyles;
  data: Buffer;
  maxHeight: number;
  caption?: string | null;
  /** Quarter turns to apply while drawing. The file itself is never altered. */
  rotation?: number;
}) {
  const turn = normaliseRotation(rotation);
  // Fitted on the photograph as it will appear, then drawn at its own
  // orientation and turned - the same two steps as a plate.
  const box = fitBox(rotatedSize(imageSize(data), turn), CONTENT_WIDTH, maxHeight);
  const drawn = isQuarterTurn(turn)
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };

  return (
    <View style={s.cover} wrap={false}>
      <View
        style={
          turn === 0
            ? { width: box.width, height: box.height }
            : { width: box.width, height: box.height, overflow: "hidden" }
        }
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image
          style={
            turn === 0
              ? { width: drawn.width, height: drawn.height }
              : {
                  width: drawn.width,
                  height: drawn.height,
                  transform: `rotate(${turn}deg)`,
                  transformOrigin: "center",
                }
          }
          src={data}
        />
      </View>
      {caption ? <Text style={s.coverCaption}>{caption}</Text> : null}
    </View>
  );
}

/**
 * Where a printed copy is signed.
 *
 * Prepared by, a rule to sign on, and a rule to date. Nothing is filled in
 * that is not already recorded: the author's name comes from the report, and
 * the signature and date are left blank because inventing either would be
 * putting words in somebody's hand.
 *
 * It says prepared, and says so twice - in the heading note as well as the
 * label - because that is all it is. There is no "approved", no "accepted"
 * and no "certified" here: this document is a contractor's record of what
 * happened on a job, and a box implying a client had agreed to it would be a
 * false record of an agreement that never took place.
 */
export function SignOff({ s, preparedBy }: { s: PdfStyles; preparedBy: string | null }) {
  return (
    <View style={s.signOff} wrap={false}>
      {/* No heading of its own: the three labels below say what this is, and a
          SIGN-OFF banner above them cost a Progress Report with one plate its
          second page for no information at all. */}
      <View style={s.signOffRow}>
        <View style={s.signOffCell}>
          <Text style={s.signOffLabel}>Prepared by</Text>
          {preparedBy ? (
            <Text style={s.signOffValue}>{preparedBy}</Text>
          ) : (
            <View style={s.signOffLine} />
          )}
        </View>
        <View style={s.signOffCell}>
          <Text style={s.signOffLabel}>Signature</Text>
          <View style={s.signOffLine} />
        </View>
        <View style={s.signOffCell}>
          <Text style={s.signOffLabel}>Date</Text>
          <View style={s.signOffLine} />
        </View>
      </View>
      <Text style={s.signOffNote}>
        Signed for identification by the person who prepared this report. Not an approval, an
        acceptance of the works, or a certificate of completion.
      </Text>
    </View>
  );
}

/**
 * The running footer: who and what on the left, the document in the middle,
 * the page count on the right.
 *
 * No URLs and no legal boilerplate. A printed page that has been separated
 * from the rest needs to be identifiable and placeable, and that is all.
 */
export function RunningFooter({
  s,
  companyName,
  projectName,
  documentLabel,
}: {
  s: PdfStyles;
  companyName: string;
  projectName: string;
  documentLabel: string;
}) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerCell}>
        {companyName} · {projectName}
      </Text>
      <Text style={s.footerMiddle}>{documentLabel}</Text>
      <Text
        style={s.footerRight}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

/**
 * What this document is, in the order a reader needs it.
 *
 * Type and number first, because that is how it will be referred to in an
 * email; then the project; then the client and reference beneath. `large` gives
 * the Completion Report a slightly stronger opening without spending a page on
 * a cover sheet.
 */
export function DocumentTitle({
  s,
  documentType,
  number,
  projectName,
  context,
  large = false,
}: {
  s: PdfStyles;
  documentType: string;
  number: string;
  projectName: string;
  context: (string | null | undefined)[];
  large?: boolean;
}) {
  const line = context.filter((part) => part && part.trim()).join("  ·  ");
  return (
    <View style={s.titleBlock}>
      <View style={s.titleRow}>
        <Text style={large ? s.docTypeLarge : s.docType}>{documentType}</Text>
        <View>
          <Text style={s.docNumberLabel}>No.</Text>
          <Text style={s.docNumber}>{number}</Text>
        </View>
      </View>
      <Text style={s.docProject}>{projectName}</Text>
      {line ? <Text style={s.docContext}>{line}</Text> : null}
    </View>
  );
}

export type ControlItem = { label: string; value: string | null | undefined };

/**
 * The document control panel: dates, references, who issued it.
 *
 * A panel rather than loose lines, because these are the fields a reader scans
 * for rather than reads. An entry with nothing in it is dropped instead of
 * printing a blank - a labelled empty cell reads as a fault in the document.
 */
export function ControlPanel({ s, items }: { s: PdfStyles; items: ControlItem[] }) {
  const filled = items.filter((item) => item.value && String(item.value).trim());
  if (filled.length === 0) return null;
  return (
    <View style={s.control} wrap={false}>
      {filled.map((item) => (
        <View key={item.label} style={s.controlCell}>
          <Text style={s.controlLabel}>{item.label}</Text>
          <Text style={s.controlValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A section heading.
 *
 * `minPresenceAhead` reserves room below it, so a heading is never the last
 * thing on a page with its section starting on the next one. It is not
 * `wrap={false}` on the section itself - that was what used to throw a whole
 * section onto a fresh page rather than let it split.
 */
export function SectionHeading({
  s,
  children,
  note,
  reserve = 48,
}: {
  s: PdfStyles;
  children: string;
  note?: string;
  reserve?: number;
}) {
  return (
    <View style={s.sectionHeader} minPresenceAhead={reserve} wrap={false}>
      <View style={s.sectionTick} />
      <Text style={s.sectionTitle}>{children}</Text>
      {note ? <Text style={s.sectionNote}>{note}</Text> : null}
    </View>
  );
}

export type GroupedSection = { type: string; label: string; content: string };

/**
 * The written sections inside one of a report's three groups.
 *
 * Each stored section is a paragraph opening with its own name in bold - "Works
 * completed." - rather than a heading block of its own. That is what lets a
 * document show three headings without losing the distinction between work
 * recorded as completed and work recorded as planned, which is the distinction
 * a dispute turns on. See lib/report-structure.ts.
 *
 * The label is a nested Text so it sits inside the same paragraph flow: a
 * separate element would break the line and give back the heading this is
 * replacing.
 */
export function GroupedProse({
  s,
  group,
  entries,
}: {
  s: PdfStyles;
  group: ReportGroup;
  entries: readonly GroupedSection[];
}) {
  return (
    <>
      {entries.map((entry) => {
        const label = runInLabel(group, entry.label, entries.length);
        return (
          <Text key={entry.type} style={s.paragraph}>
            {label ? <Text style={s.runIn}>{`${label} `}</Text> : null}
            {entry.content}
          </Text>
        );
      })}
    </>
  );
}

export type Column = { key: string; label: string; width: string; numeric?: boolean };

/**
 * A table.
 *
 * Header rule strong, row rules hairline, no vertical lines at all: the
 * columns are held apart by alignment and space, which is how a contractor's
 * own paperwork does it and what keeps it readable at phone size.
 */
export function DataTable({
  s,
  columns,
  rows,
}: {
  s: PdfStyles;
  columns: Column[];
  rows: { key: string; cells: (string | number)[] }[];
}) {
  const row = (entry: { key: string; cells: (string | number)[] }) => (
    <View style={s.tableRow} key={entry.key} wrap={false}>
      {columns.map((column, index) => (
        <Text
          key={column.key}
          style={[s.tableCell, { width: column.width }, column.numeric ? s.numeric : {}]}
        >
          {entry.cells[index]}
        </Text>
      ))}
    </View>
  );

  return (
    <>
      {/* The header travels with the first row. A column header alone at the
          foot of a page, with the table itself overleaf, reads as a document
          that has come apart. */}
      <View wrap={false}>
        <View style={s.tableHeadRow}>
          {columns.map((column) => (
            <Text
              key={column.key}
              style={[s.tableHeadCell, { width: column.width }, column.numeric ? s.numeric : {}]}
            >
              {column.label}
            </Text>
          ))}
        </View>
        {rows.length > 0 ? row(rows[0]) : null}
      </View>
      {rows.slice(1).map(row)}
    </>
  );
}

/**
 * A small status chip.
 *
 * Outlined by default; filled only for the one state worth spotting from
 * across a page. Nothing here is decorative - a badge that carried no meaning
 * would just be colour on a client's document.
 */
export function Badge({
  s,
  label,
  colour,
  filled = false,
  inverse,
}: {
  s: PdfStyles;
  label: string;
  colour: string;
  filled?: boolean;
  inverse: string;
}) {
  return (
    <View
      style={[s.badge, { borderColor: colour }, filled ? { backgroundColor: colour } : {}]}
    >
      <Text style={[s.badgeText, { color: filled ? inverse : colour }]}>{label}</Text>
    </View>
  );
}

export type IssueRecordData = {
  id: string;
  title: string;
  description: string | null;
  responsible: string | null;
  /** Present on consolidated reports, which carry the closing record. */
  resolution?: string | null;
  priority: IssuePriority;
  priorityLabel: string;
  statusLabel: string;
};

/**
 * The room an Issues heading needs below it: the height of the first record.
 *
 * Estimated from the text rather than measured, because react-pdf will not
 * report a height back before it lays the page out. It only has to be close:
 * a little over reserves a few points too many, and a little under is caught
 * by the card's own wrap={false}. A fixed guess was worse in both directions -
 * too small stranded the heading, too large threw it a page early and left a
 * hole where the record would have fitted.
 */
export function issueReserve(issue: IssueRecordData): number {
  // A full-width line at 9.5pt Helvetica carries roughly a hundred characters.
  const lines = (text: string | null | undefined) =>
    text?.trim() ? Math.max(1, Math.ceil(text.trim().length / 100)) : 0;
  const estimate =
    16 + // the title
    15 + // the priority and status badges
    lines(issue.description) * 13 +
    (issue.resolution?.trim() ? 11 + lines(issue.resolution) * 13 : 0) +
    (issue.responsible?.trim() ? 11 + lines(issue.responsible) * 13 : 0) +
    10; // the card's own spacing
  // Rounded up. Under-reserving strands the heading, which is the fault being
  // fixed; over-reserving moves the heading down with its record, which is
  // merely a few points of white space.
  return Math.round(estimate * 1.2);
}

/**
 * One issue, as a record rather than as a run-on line.
 *
 * Title, then the two things a reader wants immediately - how serious and
 * where it stands - then only the fields that actually hold something.
 * Nothing is invented and no empty label is printed: an issue with no
 * resolution recorded simply has no Resolution line.
 */
export function IssueRecord({
  s,
  issue,
  colour,
  inverse,
}: {
  s: PdfStyles;
  issue: IssueRecordData;
  colour: string;
  inverse: string;
}) {
  const closed = /closed/i.test(issue.statusLabel);
  return (
    <View style={[s.issue, { borderLeftColor: colour }]} wrap={false}>
      <Text style={s.issueTitle}>{issue.title}</Text>
      <View style={s.badgeRow}>
        <Badge s={s} label={issue.priorityLabel.toUpperCase()} colour={colour} inverse={inverse} />
        <Badge
          s={s}
          label={issue.statusLabel.toUpperCase()}
          colour={closed ? "#3f3f46" : "#71717a"}
          filled={closed}
          inverse={inverse}
        />
      </View>
      {issue.description ? <Text style={s.text}>{issue.description}</Text> : null}
      {issue.resolution ? (
        <View style={s.issueField}>
          <Text style={s.issueFieldLabel}>Resolution</Text>
          <Text style={s.text}>{issue.resolution}</Text>
        </View>
      ) : null}
      {issue.responsible ? (
        <View style={s.issueField}>
          <Text style={s.issueFieldLabel}>Responsible</Text>
          <Text style={s.text}>{issue.responsible}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The room the Photographic evidence heading needs below it.
 *
 * Exactly the height of the plate that follows it, plus its reference line and
 * caption. A fixed guess would either strand the heading at the foot of a page
 * with its first plate overleaf, or throw the heading forward and leave a hole
 * where two thirds of a plate would have fitted.
 */
export function plateReserve(data: Buffer, bounds?: PlateBounds, rotation = 0): number {
  // Measured on the photograph as it will appear: a turned portrait reserves
  // the room a landscape plate needs, not the room it needed before the turn.
  return (
    photoBoxHeight(rotatedSize(imageSize(data), rotation), PHOTO_COLUMN_WIDTH, bounds) + 34
  );
}

/**
 * One photographic plate.
 *
 * Reference and status above, the photograph itself, the caption below. The
 * reference is derived from position - see lib/pdf/photo-evidence.ts - so the
 * text of the report can cite P03 and mean something.
 *
 * The box height comes from the photograph's own dimensions, so a portrait
 * shot is given a portrait box instead of being stranded in a landscape one.
 * `wrap={false}` keeps a plate whole: a caption at the top of the next page
 * belongs to a photograph the reader can no longer see.
 */
export function PhotoPlate({
  s,
  index,
  label,
  data,
  bounds,
  rotation = 0,
}: {
  s: PdfStyles;
  index: number;
  label: { caption: string | null; status: string | null };
  data: Buffer;
  /** The Photo style prints its plates larger; the others use the defaults. */
  bounds?: PlateBounds;
  /** Quarter turns to apply while drawing. The file itself is never altered. */
  rotation?: number;
}) {
  const item: PhotoEvidenceItem = photoEvidence(label, index);
  const turn = normaliseRotation(rotation);

  // The plate is measured on the photograph as it will appear, not as it is
  // stored: a portrait shot turned on its side is a landscape plate, and a box
  // measured before the turn would be a tall frame round a wide picture.
  const box = photoBoxSize(rotatedSize(imageSize(data), turn), PHOTO_COLUMN_WIDTH, bounds);

  // The image is drawn at its own orientation and then turned inside that box,
  // so for a quarter turn it is laid out with the box's dimensions swapped -
  // rotating a w x h rectangle by 90 degrees leaves it occupying h x w.
  const drawn = isQuarterTurn(turn)
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };

  return (
    <View style={s.photoCell} wrap={false}>
      <View style={s.photoRefRow}>
        <View style={s.photoRefTick} />
        <Text style={s.photoRef}>{item.reference}</Text>
        {item.status ? <Text style={s.photoStatus}>{item.status}</Text> : null}
      </View>
      <View
        style={[
          s.photoFrame,
          { width: box.width + 4, height: box.height + 4 },
          // The turned image is wider or taller than its frame before it
          // rotates; the frame holds the shape a reader sees.
          turn === 0 ? {} : { overflow: "hidden" },
        ]}
      >
        {/* react-pdf's Image is not an HTML img and takes no alt - the caption
            below it is what a reader gets. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image
          style={
            turn === 0
              ? { width: drawn.width, height: drawn.height }
              : {
                  width: drawn.width,
                  height: drawn.height,
                  transform: `rotate(${turn}deg)`,
                  // About its own middle, so a quarter turn lands centred in
                  // the frame rather than pivoting off one corner.
                  transformOrigin: "center",
                }
          }
          src={data}
        />
      </View>
      {item.caption ? <Text style={s.photoCaption}>{item.caption}</Text> : null}
    </View>
  );
}

export type GridPhoto = {
  id: string;
  label: { caption: string | null; status: string | null };
  data: Buffer;
  /** Quarter turns to apply while drawing. Absent means as uploaded. */
  rotation?: number;
};

/**
 * The photographic evidence, two plates to a row.
 *
 * Rows are built here rather than left to `flexWrap`. react-pdf lays a
 * wrapping container out as a single block and splits it badly across a page
 * boundary - four plates came out two to a page with two thirds of each page
 * empty. A row at a time paginates like any other stack of blocks, and each
 * row is kept whole so a plate is never cut in half.
 */
export function PhotoGrid({
  s,
  photos,
  bounds,
}: {
  s: PdfStyles;
  photos: GridPhoto[];
  bounds?: PlateBounds;
}) {
  const rows: GridPhoto[][] = [];
  for (let index = 0; index < photos.length; index += 2) {
    rows.push(photos.slice(index, index + 2));
  }
  return (
    <>
      {rows.map((row, rowIndex) => (
        <View key={row[0].id} style={s.photoRow} wrap={false}>
          {row.map((photo, column) => (
            <PhotoPlate
              key={photo.id}
              s={s}
              index={rowIndex * 2 + column}
              label={photo.label}
              data={photo.data}
              bounds={bounds}
              rotation={photo.rotation}
            />
          ))}
        </View>
      ))}
    </>
  );
}

/**
 * The register of documents this report was issued against.
 *
 * Reference, revision and date are optional on every document, so a column
 * appears only when at least one row has something to put in it - five blank
 * cells tell the reader nothing and make the table look like a fault.
 *
 * The note says plainly where the documents themselves are. Nothing here is a
 * link: a signed URL stops working within the hour and would be dead by the
 * time a client opened the file.
 */
export function DocumentRegister({
  s,
  rows,
  appended,
}: {
  s: PdfStyles;
  rows: ResolvedDocument[];
  appended: boolean;
}) {
  const visible = visibleDocumentColumns(rows);
  const width = `${100 / visible.length}%`;
  const columns: Column[] = visible.map((column) => ({
    key: column,
    label: DOCUMENT_COLUMN_LABELS[column],
    width,
  }));
  return (
    <>
      <DataTable
        s={s}
        columns={columns}
        rows={rows.map((row, index) => ({
          key: `${row.title}-${index}`,
          cells: visible.map((column) => documentCell(row, column)),
        }))}
      />
      <Text style={s.note}>
        {appended
          ? "The documents listed above follow this report as appendices."
          : "The documents listed above are held on the project record."}
      </Text>
    </>
  );
}
