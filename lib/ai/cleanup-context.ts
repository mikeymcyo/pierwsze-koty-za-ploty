import "server-only";

import type { CleanupMedia } from "@/lib/ai/cleanup-prompt";
import { documentTypeLabel } from "@/lib/documents/metadata";
import { loadReferencedDocuments } from "@/lib/documents/snapshot";
import type { DocumentParent } from "@/lib/documents/snapshot";
import { photoPrintLabelText } from "@/lib/photo-captions";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * What the Cleanup AI is allowed to call a photograph and what it is allowed to
 * call a drawing.
 *
 * The rule is that the distinction comes from stored metadata and from nothing
 * else. That is not pedantry: a report that describes a drawing as a
 * photograph, or the other way round, is wrong about what evidence exists, and
 * it is wrong in a document that may be read next to that evidence in a
 * dispute. The cleanup pass cannot see either, so it is told what each one is
 * and told never to infer it from a caption or a title.
 *
 * - A row in `photos` is a photograph. That is what the table records.
 * - A referenced document is a drawing when its recorded `doc_type` is
 *   `drawing`, and otherwise is named by whatever type it does carry - RAMS, a
 *   permit, a delivery note.
 * - Anything whose type was never recorded is `unknown`, and the prompt tells
 *   the model to leave it alone rather than guess.
 *
 * The document metadata is read exactly as lib/reports/review-context.ts reads
 * it - the snapshot where an issued report has one, the live row otherwise - so
 * the cleanup pass and the Master AI Review never disagree about which revision
 * of a drawing a report was issued against.
 */
export function photoMedia(
  photos: readonly { category: string; caption: string | null }[],
): CleanupMedia[] {
  return photos.map((photo) => ({
    kind: "photograph" as const,
    typeLabel: null,
    reference: null,
    // The same label the report prints, so the prose and the plate agree.
    caption: photoPrintLabelText(photo),
  }));
}

export async function documentMedia(
  supabase: Client,
  parent: DocumentParent,
): Promise<CleanupMedia[]> {
  const referenced = await loadReferencedDocuments(supabase, parent);

  return referenced.flatMap((entry) => {
    const type = entry.snapshot.type_at_issue ?? entry.live?.doc_type ?? null;
    const title = entry.snapshot.title_at_issue ?? entry.live?.title ?? null;
    // No snapshot and no live row: the document is gone and there is nothing
    // reliable to say about it.
    if (!title) return [];

    const reference = entry.snapshot.reference_at_issue ?? entry.live?.reference ?? null;
    const revision = entry.snapshot.revision_at_issue ?? entry.live?.revision ?? null;

    return [
      {
        kind: type === "drawing" ? ("drawing" as const) : type ? ("document" as const) : ("unknown" as const),
        typeLabel: type ? documentTypeLabel(type) : null,
        reference: [reference, revision ? `rev ${revision}` : null].filter(Boolean).join(" ") || null,
        caption: title,
      },
    ];
  });
}
