"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Check, FileText, MapPin, Navigation, Paperclip, RotateCcw, Users } from "lucide-react";

import { attachJobPo, setJobStatus, type JobActionState } from "@/app/(app)/jobs/actions";
import { useRecoverableActionState } from "@/lib/hooks/use-recoverable-action-state";
import { JOB_GROUP_LABELS, JOB_PO_BUCKET, googleMapsUrl, wazeUrl, whenLabel, type JobGroup } from "@/lib/jobs/jobs";
import { createClient } from "@/lib/supabase/client";
import { validatePoPdf } from "@/lib/jobs/po-files";
import { cn } from "@/lib/utils";

/** The priority stripe and pill, one colour per group. */
const GROUP_STYLE: Record<JobGroup, { stripe: string; pill: string }> = {
  fixed: { stripe: "bg-job-fixed", pill: "bg-job-fixed text-white" },
  overdue: { stripe: "bg-job-overdue", pill: "bg-job-overdue text-white" },
  this_week: { stripe: "bg-job-week", pill: "bg-job-week text-empire-forest" },
  later: { stripe: "bg-job-later", pill: "bg-job-later text-white" },
};

export type JobPo = {
  id: string;
  po_number: string;
  po_file_id: number | null;
  storage_path: string | null;
};

export type JobCardData = {
  id: string;
  store_name: string;
  store_code: string | null;
  fixed_date: string | null;
  fixed_time: string | null;
  fixed_note: string | null;
  target_date: string | null;
  work: string;
  crew: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  status: "open" | "done";
  pos: JobPo[];
};

function StatusButton({ done }: { done: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-empire-sage ring-1 ring-empire-olive ring-inset transition-colors hover:bg-empire-olive/40 disabled:opacity-50"
    >
      {done ? <RotateCcw aria-hidden className="size-4" /> : <Check aria-hidden className="size-4" />}
      {pending ? "Saving…" : done ? "Reopen" : "Mark done"}
    </button>
  );
}

/**
 * Attach or replace the PDF for one PO, from the phone.
 *
 * The file goes straight from the browser into the private bucket, under the
 * company's folder, then the path is recorded on the PO. While that happens
 * the button says so; afterwards the page is refreshed so the PO PDF button
 * appears. The upload is PDF only - that is what Lidl issues.
 */
function PoAttach({ jobId, poId, companyId, storagePath }: { jobId: string; poId: string; companyId: string; storagePath: string | null }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const validationError = await validatePoPdf(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      const supabase = createClient();
      const path = `${companyId}/${jobId}/${poId}-${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(JOB_PO_BUCKET)
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) {
        setError(`${file.name} could not be uploaded. ${uploadError.message}`);
        return;
      }
      const result = await attachJobPo({ poId, storagePath: path, expectedStoragePath: storagePath, originalFilename: file.name, fileSize: file.size });
      if (result.error) setError(result.error);
      else router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The PDF could not be attached.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => void handle(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-empire-sage ring-1 ring-empire-olive ring-inset transition-colors hover:bg-empire-olive/40 disabled:opacity-50"
      >
        <Paperclip aria-hidden className="size-4" />
        {busy ? "Attaching…" : storagePath ? "Replace PDF" : "Attach PDF"}
      </button>
      {error ? <p role="alert" className="basis-full text-sm text-empire-rose">{error}</p> : null}
    </>
  );
}

export function JobCard({ job, group, companyId }: { job: JobCardData; group: JobGroup; companyId: string }) {
  const [state, action] = useRecoverableActionState<JobActionState, FormData>(setJobStatus, {});
  const done = job.status === "done";
  const style = GROUP_STYLE[group];
  const hasLocation = job.lat !== null && job.lng !== null;

  return (
    <article
      data-job-card
      data-group={group}
      className={cn(
        "relative overflow-hidden rounded-card bg-empire-forest p-4 pl-5 text-empire-sage shadow-card ring-1 ring-empire-olive/70 ring-inset",
        done && "opacity-70",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", style.stripe)} />

      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-bold text-white">
            {job.store_name}
            {job.store_code ? <span className="ml-2 text-base font-semibold text-empire-sage">{job.store_code}</span> : null}
          </h2>
          <p className="mt-1 text-sm font-semibold text-white">{whenLabel(job)}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase", style.pill)}>
          {JOB_GROUP_LABELS[group]}
        </span>
      </div>

      {job.pos.length > 0 ? (
        <p className="mt-2 text-sm">
          <span className="text-empire-sage/70">PO </span>
          {job.pos.map((po) => po.po_number).join(" · ")}
        </p>
      ) : (
        <p className="mt-2 text-sm text-empire-sage/70">No PO yet</p>
      )}

      <p className="mt-3 text-[15px] leading-relaxed text-white/90">{job.work}</p>

      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        {job.crew ? (
          <div className="flex items-start gap-2">
            <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-empire-sage/70" />
            <dd>{job.crew}</dd>
          </div>
        ) : null}
        {job.address ? (
          <div className="flex items-start gap-2">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-empire-sage/70" />
            <dd>{job.address}</dd>
          </div>
        ) : null}
        {job.notes ? (
          <div className="flex items-start gap-2">
            <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-empire-sage/70" />
            <dd className="text-empire-sage/90">{job.notes}</dd>
          </div>
        ) : null}
      </dl>

      {/* Go there: the two apps a driver uses, as the store's own pin. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {hasLocation ? (
          <>
            <a
              href={wazeUrl(job.lat!, job.lng!)}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-empire-olive px-4 text-sm font-bold text-white transition-[filter] hover:brightness-110"
            >
              <Navigation aria-hidden className="size-4" />
              Waze
            </a>
            <a
              href={googleMapsUrl(job.lat!, job.lng!)}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-empire-olive px-4 text-sm font-bold text-white transition-[filter] hover:brightness-110"
            >
              <MapPin aria-hidden className="size-4" />
              Google Maps
            </a>
          </>
        ) : (
          <p className="text-sm text-empire-sage/70">No location yet - exact store to be confirmed.</p>
        )}
      </div>

      {/* The PO PDFs: one row per PO, open it or attach it. */}
      {job.pos.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {job.pos.map((po) => (
            <li key={po.id} className="flex flex-wrap items-center gap-2">
              {po.storage_path ? (
                <a
                  href={`/jobs/${job.id}/po/${po.id}/file`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-empire-sage px-4 text-sm font-bold text-empire-forest transition-[filter] hover:brightness-95"
                >
                  <FileText aria-hidden className="size-4" />
                  PO PDF {job.pos.length > 1 ? po.po_number : ""}
                </a>
              ) : (
                <span className="text-sm text-empire-sage/70">PO {po.po_number}: no PDF yet</span>
              )}
              <PoAttach jobId={job.id} poId={po.id} companyId={companyId} storagePath={po.storage_path} />
            </li>
          ))}
        </ul>
      ) : null}

      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="jobId" value={job.id} />
        <input type="hidden" name="status" value={done ? "open" : "done"} />
        <StatusButton done={done} />
        {state.error ? <p role="alert" className="text-sm text-empire-rose">{state.error}</p> : null}
      </form>
    </article>
  );
}
