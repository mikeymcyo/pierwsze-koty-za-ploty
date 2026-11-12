import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { JobCardData } from "@/components/jobs/job-card";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import type { Database } from "@/types/database";

const PAGE_SIZE = 500;

async function readPages<T extends { id: string }>(
  read: (after?: string) => Promise<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    const { data, error } = await read(after);
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
    after = data[data.length - 1]!.id;
  }
}

export async function listJobs(supabase: SupabaseClient<Database>, companyId: string, status: JobCardData["status"]) {
  // Page each table independently so even one job with many POs stays complete.
  // The ID cursor stays stable when an earlier job is marked done or reopened.
  const [jobs, pos] = await Promise.all([
    readPages((after) => withClockSkewRetry(() => {
      const query = supabase.from("jobs")
        .select("id, store_name, store_code, fixed_date, fixed_time, fixed_note, target_date, work, crew, address, lat, lng, notes, status")
        .eq("company_id", companyId).eq("status", status)
        .order("id").limit(PAGE_SIZE);
      return after ? query.gt("id", after) : query;
    })),
    readPages((after) => withClockSkewRetry(() => {
      const query = supabase.from("job_pos")
        .select("id, job_id, po_number, po_file_id, storage_path, created_at, jobs!inner(status)")
        .eq("company_id", companyId).eq("jobs.status", status)
        .order("id").limit(PAGE_SIZE);
      return after ? query.gt("id", after) : query;
    })),
  ]);
  const error = jobs.error ?? pos.error;
  if (error) return { jobs: [], error };

  const cards = new Map<string, JobCardData>(jobs.data.map((job) => [job.id, { ...job, pos: [] }]));
  // Cards list the POs in the order they were added, regardless of page boundaries.
  pos.data.sort((a, b) => {
    if (a.created_at === b.created_at) return 0;
    return a.created_at < b.created_at ? -1 : 1;
  });
  for (const { job_id, id, po_number, po_file_id, storage_path } of pos.data) {
    cards.get(job_id)?.pos.push({ id, po_number, po_file_id, storage_path });
  }
  return { jobs: [...cards.values()], error: null };
}
