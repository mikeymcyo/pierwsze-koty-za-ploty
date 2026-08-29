import "server-only";

import { DOCUMENT_BUCKET, resolveDocument } from "@/lib/documents/metadata";
import { loadReferencedDocuments, type DocumentParent } from "@/lib/documents/snapshot";
import type { MergeAttachment } from "@/lib/pdf/merge";
import {
  describeUnavailable,
  orderAttachments,
  unavailableDocuments,
} from "@/lib/reports/document-package";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AttachmentLoad =
  | { ok: true; attachments: MergeAttachment[]; count: number }
  | { ok: false; error: string };

/**
 * The bytes of every supporting document a report references, in order.
 *
 * Downloaded server-side from the private bucket rather than fetched by a
 * URL, for the same reason the photographs are: a signed URL can expire
 * mid-render, and an issued record must not depend on the network holding up
 * at the moment somebody presses the button.
 *
 * Nothing is skipped. A document whose file has gone, or whose bytes will not
 * download, fails the whole load and is named - a register listing five
 * drawings above four sets of pages is worse than a refusal, because nobody
 * notices until the missing one is the one that matters.
 */
export async function loadDocumentAttachments(
  supabase: Client,
  parent: DocumentParent,
): Promise<AttachmentLoad> {
  const referenced = await loadReferencedDocuments(supabase, parent);
  if (referenced.length === 0) return { ok: true, attachments: [], count: 0 };

  const packaged = referenced.map((entry) => {
    const resolved = resolveDocument(entry.snapshot, entry.live);
    return {
      documentId: entry.documentId,
      // The snapshot's title where the report has been issued, so a failure
      // message names the document the way the register does.
      title: resolved?.title ?? entry.live?.title ?? "an unnamed document",
      storagePath: entry.live?.storage_path ?? null,
      sortOrder: entry.sortOrder,
    };
  });

  const ordered = orderAttachments(packaged);

  const missing = unavailableDocuments(ordered);
  if (missing.length > 0) return { ok: false, error: describeUnavailable(missing) };

  const attachments: MergeAttachment[] = [];
  const unreadable: string[] = [];

  for (const document of ordered) {
    const { data: file } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .download(document.storagePath as string);
    if (!file) {
      unreadable.push(document.title);
      continue;
    }
    attachments.push({
      title: document.title,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  }

  if (unreadable.length > 0) {
    const list = unreadable.join(", ");
    return {
      ok: false,
      error:
        unreadable.length === 1
          ? `"${list}" could not be downloaded, so nothing has been issued. Try again in a moment.`
          : `${unreadable.length} supporting documents could not be downloaded, so nothing has been issued: ${list}. Try again in a moment.`,
    };
  }

  return { ok: true, attachments, count: attachments.length };
}
