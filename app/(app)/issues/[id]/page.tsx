import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IssueForm } from "@/components/issues/issue-form";
import type { PhotoChoice } from "@/components/issues/raise-issue";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { PHOTO_CATEGORY_LABELS } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Issue" };

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSessionContext();
  const supabase = await createClient();

  const { data: issue, error } = await withClockSkewRetry(() =>
    supabase
      .from("issues")
      .select("id, title, description, resolution, responsible, photo_id, priority, status, project_id, created_at")
      .eq("id", id)
      .maybeSingle(),
  );

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <LoadError what="this issue" code={error.code} />
      </div>
    );
  }

  // RLS hides another company's issue, so this covers "missing" and "not
  // yours" identically, without revealing which.
  if (!issue) notFound();

  // Photos from the same project, so an issue can point at the one that shows
  // the problem. The composite foreign key keeps the pairing inside one
  // company even if this list were tampered with.
  const { data: photoRows } = await withClockSkewRetry(() =>
    supabase
      .from("photos")
      .select("id, caption, category, created_at")
      .eq("project_id", issue.project_id)
      .order("created_at", { ascending: false }),
  );

  const photos: PhotoChoice[] = (photoRows ?? []).map((photo) => ({
    id: photo.id,
    label: photo.caption
      ? `${photo.caption} (${PHOTO_CATEGORY_LABELS[photo.category]})`
      : `${PHOTO_CATEGORY_LABELS[photo.category]} - ${formatDate(photo.created_at)}`,
  }));

  const backHref = `/projects/${issue.project_id}?tab=issues`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={backHref}
        className="text-sm font-semibold text-ink-muted underline underline-offset-4 hover:text-ink"
      >
        Back to the project
      </Link>

      <h1 className="text-2xl font-bold tracking-tight text-balance text-ink md:text-3xl">
        Issue
      </h1>

      <IssueForm issue={issue} photos={photos} cancelHref={backHref} />
    </div>
  );
}
