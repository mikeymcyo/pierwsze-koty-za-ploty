"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Mic } from "lucide-react";
import { commitFieldPart } from "@/lib/field-commit";
import { keepFieldDraft, listFieldDrafts, readFieldMedia, removeFieldDraft, type FieldDraft } from "@/lib/field-outbox";
import { uploadFieldPhoto } from "@/lib/field-photo";
import { startFieldVoice, transcribeFieldVoice, type FieldVoice } from "@/lib/field-voice";
import { workingDay } from "@/lib/reports/working-day";
import { clockNow } from "@/lib/reports/prepare-with-pending";

type Props = {
  userId: string;
  companyId: string;
  projectId: string;
  projectName: string;
  reportId?: string;
  dashboard?: boolean;
};
const button = "min-h-12 rounded-xl bg-primary px-4 py-2 font-semibold text-ink-inverse disabled:opacity-50";
const secondary = "min-h-11 rounded-xl border border-line px-3 py-2 font-semibold text-ink";
const describe = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
function stopTracks(stream: MediaStream | null) { stream?.getTracks().forEach(track => track.stop()); }

function snapshot(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context || !canvas.width || !canvas.height) throw new Error("The camera is still starting.");
  context.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob =>
    blob ? resolve(blob) : reject(new Error("The photo could not be captured. Tap the shutter again.")), "image/jpeg", 0.92));
}

export function FieldCapture({ userId, companyId, projectId, projectName, reportId, dashboard }: Props) {
  const scope = userId + ":" + companyId;
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const camera = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const voice = useRef<Promise<FieldVoice | null> | null>(null);
  const active = useRef<FieldDraft | null>(null);
  const shuttering = useRef(false);
  const finishing = useRef(false);
  const uploading = useRef(new Set<string>());
  const originals = useRef(new Map<string, Blob>());
  const unwritten = useRef(new Map<string, Blob>());
  const [records, setRecords] = useState<FieldDraft[]>([]);
  const [frame, setFrame] = useState(false);
  const [cameraMs, setCameraMs] = useState<number | null>(null);
  const [photos, setPhotos] = useState(0);
  const [recording, setRecording] = useState(false);
  const [startingVoice, setStartingVoice] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [status, setStatus] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState("");
  const [completedReport, setCompletedReport] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [note, setNote] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    let current = true;
    const initialRevision = revision.current;
    listFieldDrafts(scope).then(saved => {
      if (!current) return;
      setRecords(previous => revision.current === initialRevision ? saved :
        [...previous, ...saved.filter(row => !previous.some(held => held.id === row.id))]);
    }).catch(() => { if (current) setStorageWarning("Phone storage is unavailable. Keep this screen open and keep a copy of your media."); });
    return () => {
      current = false;
      generation.current = -1;
      stopTracks(camera.current);
      void voice.current?.then(session => session?.finish()).catch(() => {});
    };
  }, [scope]);

  function showRow(row: FieldDraft) {
    revision.current++;
    const copy = { ...row, photos: [...row.photos], attached: [...row.attached] };
    setRecords(prev => [...prev.filter(other => other.id !== row.id), copy]);
  }

  function persist(row: FieldDraft, media: {id: string; blob: Blob}[] = []) {
    for (const {id, blob} of media) {
      originals.current.set(id, blob);
      unwritten.current.set(id, blob);
    }
    const retryMedia = [row.id, ...row.photos].flatMap(id => {
      const blob = unwritten.current.get(id);
      return blob ? [{id, blob}] : [];
    });
    return keepFieldDraft(row, retryMedia).then(() => {
      for (const {id, blob} of retryMedia) {
        if (unwritten.current.get(id) === blob) unwritten.current.delete(id);
      }
    }).catch(error => {
      setStorageWarning("Phone storage is unavailable. Keep this screen open. Download the originals below before leaving.");
      throw error;
    });
  }

  function openCamera() {
    if (dialog.current?.open) return;
    const token = ++generation.current;
    active.current = null;
    setCameraMs(null); setActiveId(""); setNotice(""); setStatus(""); setFrame(false); setPhotos(0); setRecording(false); setNote("");
    dialog.current?.showModal();
    performance.mark("siteboss:capture-tap");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Use the phone camera or photo library below.");
      // Start the camera inside the tap. Report resolution, IDB reads and uploads run independently.
      const request = navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: {ideal: 1920}, height: {ideal: 1440} }, audio: false });
      void request.then(async stream => {
        if (token !== generation.current || !video.current) { stopTracks(stream); return; }
        camera.current = stream;
        video.current.srcObject = stream;
        await video.current.play();
      }).catch(error => { if (token === generation.current) setNotice("Camera unavailable. Use the phone camera or photo library below. " + describe(error)); });
    } catch (error) { setNotice(describe(error)); }
  }

  function cameraReady() {
    const player = video.current;
    const token = generation.current;
    if (!player || !player.videoWidth) return;
    const ready = () => {
      if (token !== generation.current || !dialog.current?.open) return;
      performance.mark("siteboss:camera-frame");
      const measurement = performance.measure("siteboss:camera-open", "siteboss:capture-tap", "siteboss:camera-frame");
      setCameraMs(previous => previous ?? measurement.duration);
      setFrame(true);
    };
    if (player.requestVideoFrameCallback) player.requestVideoFrameCallback(ready);
    else requestAnimationFrame(ready);
  }

  function currentDraft() {
    if (!active.current) {
      const now = new Date();
      active.current = { id: crypto.randomUUID(), scope, projectId, projectName, reportId, day: workingDay(now),
        at: clockNow(now), photos: [], attached: [], hasAudio: false, text: "" };
      setActiveId(active.current.id);
    }
    return active.current;
  }

  function beginVoice(row: FieldDraft) {
    const token = generation.current;
    setStartingVoice(true);
    voice.current = startFieldVoice(audio => {
      row.hasAudio = true;
      void persist(row, [{id: row.id, blob: audio}]).catch(() => {});
    }).then(session => {
      if (token !== generation.current) { session.cancel(); return null; }
      setRecording(true);
      return session;
    }).catch(error => {
      if (token === generation.current) setNotice("Microphone unavailable. You can type a note. " + describe(error));
      return null;
    }).finally(() => { if (token === generation.current) setStartingVoice(false); });
  }

  async function takePhotos(files?: File[]) {
    if (shuttering.current || finishing.current) return;
    const row = currentDraft();
    shuttering.current = true;
    setWaiting(true);
    try {
      const blobs = files?.length ? files : [snapshot(video.current!)];
      if (!voice.current) beginVoice(row);
      const assets = (await Promise.all(blobs)).map(blob => ({ id: crypto.randomUUID(), blob }));
      row.photos.push(...assets.map(asset => asset.id));
      await persist(row, assets).catch(() => {});
      setPhotos(row.photos.length);
      showRow(row);
    } catch (error) { setNotice(describe(error)); }
    finally { shuttering.current = false; setWaiting(false); }
  }

  function closeCamera() {
    generation.current++;
    stopTracks(camera.current);
    camera.current = null;
    if (video.current) video.current.srcObject = null;
    voice.current = null;
    active.current = null;
    dialog.current?.close();
    setActiveId(""); setStartingVoice(false); setRecording(false); setFrame(false);
  }

  function blobFor(id: string) {
    return originals.current.get(id) ?? readFieldMedia(id);
  }

  async function upload(row: FieldDraft) {
    if (uploading.current.has(row.id)) return;
    uploading.current.add(row.id);
    setBusyIds(prev => [...prev, row.id]);
    setErrors(prev => ({...prev, [row.id]: ""}));
    async function attach() {
      if (!row.reportId) {
        const result = await commitFieldPart({kind: "report", projectId: row.projectId, day: row.day});
        if (!result.reportId) throw new Error("The site report could not be opened.");
        row.reportId = result.reportId;
      }
      await persist(row).catch(() => {});
      for (const id of row.photos) {
        if (row.attached.includes(id)) continue;
        await uploadFieldPhoto({file: await blobFor(id), id, companyId, projectId: row.projectId, reportId: row.reportId});
        row.attached.push(id);
        await persist(row).catch(() => {});
      }
      if (row.hasAudio && !row.text.trim()) {
        row.text = await transcribeFieldVoice(await blobFor(row.id));
        await persist(row).catch(() => {});
      }
      if (row.text.trim()) {
        const reply = await commitFieldPart({kind: "note", reportId: row.reportId, at: row.at, text: row.text});
        if (reply.savedAt === undefined) throw new Error("The report did not confirm the note.");
      }
      await removeFieldDraft(row);
      for (const id of [row.id, ...row.photos]) {
        originals.current.delete(id);
        unwritten.current.delete(id);
      }
      revision.current++;
      setRecords(prev => prev.filter(other => other.id !== row.id));
      setCompletedReport(row.reportId);
      setStatus("Capture saved to " + row.projectName + ".");
    }
    try {
      if (navigator.locks) await navigator.locks.request("siteboss:upload:" + row.id, attach);
      else await attach();
    } catch (error) {
      showRow(row);
      setErrors(prev => ({...prev, [row.id]: describe(error)}));
    } finally {
      uploading.current.delete(row.id);
      setBusyIds(prev => prev.filter(id => id !== row.id));
    }
  }

  async function finish() {
    if (finishing.current || shuttering.current) return;
    const row = active.current;
    if (!row) { closeCamera(); return; }
    finishing.current = true; setSaving(true);
    try {
      const session = await voice.current;
      if (session) {
        const audio = await session.finish();
        row.hasAudio = true;
        await persist(row, [{ id: row.id, blob: audio }]).catch(() => {});
      }
      row.text = note;
      if (!row.photos.length && !row.hasAudio && !row.text.trim()) { closeCamera(); return; }
      await persist(row).catch(() => {});
      showRow(row);
      closeCamera();
      void upload(row);
    } catch (error) {
      voice.current = null; setRecording(false);
      setNotice("The microphone stopped. Your photos and available audio are kept. " + describe(error));
    } finally { finishing.current = false; setSaving(false); }
  }

  const pending = records.filter(row => row.id !== activeId && (dashboard || row.projectId === projectId && (!reportId || !row.reportId || row.reportId === reportId)));
  return <>
    <button type="button" onClick={openCamera} className={dashboard ? "midnight-action flex min-h-32 flex-col items-start justify-center gap-3 rounded-card p-4 text-left text-brand-ink" : button}>
      <Camera aria-hidden className="inline size-5" /> <span className="font-semibold">Capture</span>
      {dashboard && <span className="text-xs text-ink-muted">{projectName}</span>}
    </button>
    <dialog ref={dialog} aria-label="Site camera" onCancel={event => { if (active.current) event.preventDefault(); else closeCamera(); }}
      className="fixed inset-0 m-auto max-h-[95dvh] w-[95vw] max-w-lg overflow-y-auto rounded-card bg-surface p-4 text-ink backdrop:bg-black/80">
      <p className="mb-2 font-semibold">{projectName}</p>
      <video ref={video} autoPlay muted playsInline onPlaying={cameraReady} className="aspect-[4/3] w-full rounded-xl bg-black object-contain" />
      <div className="mt-3 grid gap-2">
        <button type="button" className={button} disabled={!frame || waiting || saving} onClick={() => void takePhotos()}>
          {photos ? "Take another photo" : "Take photo and start voice note"}
        </button>
        {photos > 0 && <p role="status">{photos} {photos === 1 ? "photo" : "photos"} · {startingVoice ? "Opening microphone…" : recording ? "Recording voice note" : "Microphone off"}</p>}
        {notice && <p role="alert">{notice}</p>}
        {cameraMs !== null && <details><summary className="cursor-pointer text-sm">Camera timing</summary><p>Tap to first video frame: {(cameraMs / 1000).toFixed(2)} seconds · {("standalone" in navigator && navigator.standalone === true) || matchMedia("(display-mode: standalone)").matches ? "Home Screen" : "browser"}</p></details>}
        <details open={notice && !photos ? true : undefined}><summary className="cursor-pointer py-2 text-sm">Phone camera or photo library</summary>
          <label className="block py-2">Phone camera <input type="file" accept="image/*" capture="environment" disabled={waiting || saving} onChange={e => {const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) void takePhotos(files);}} /></label>
          <label className="block py-2">Photo library <input type="file" accept="image/*" multiple disabled={waiting || saving} onChange={e => {const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) void takePhotos(files);}} /></label>
        </details>
        {photos > 0 && !recording && !startingVoice && <label>Site note<textarea className="block w-full border p-2" value={note} onChange={e => {
          const text = e.target.value; setNote(text);
          const row = active.current; if (row) {row.text = text; void persist(row).catch(() => {});}
        }} /></label>}
        {activeId ? <button type="button" className={button} disabled={waiting || saving || startingVoice} onClick={() => void finish()}>{saving ? "Saving…" : "Save capture"}</button> :
          <button type="button" className={secondary} onClick={closeCamera}>Close camera</button>}
        {storageWarning && <p role="alert">{storageWarning}</p>}
      </div>
    </dialog>
    {(storageWarning || status || pending.length > 0) && <div className="col-span-full flex flex-col gap-2">
      {storageWarning && <p role="alert">{storageWarning}</p>}
      {status && <p role="status">{status} {completedReport && <a className="underline" href={`/reports/${completedReport}/capture`}>Open report</a>}</p>}
      {pending.map(row => <PendingRow key={row.id} row={row} error={errors[row.id]} busy={busyIds.includes(row.id)}
        onRetry={() => void upload({...row, attached: [...row.attached]})} blobFor={blobFor}
        onNote={text => {const updated = {...row, text}; showRow(updated); void persist(updated).catch(() => {});}} />)}
    </div>}
  </>;
}

function PendingRow({row, error, busy, onRetry, onNote, blobFor}: {
  row: FieldDraft; error?: string; busy: boolean; onRetry: () => void; onNote: (text:string) => void;
  blobFor: (id:string) => Blob | Promise<Blob>;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function download(id: string) {
    const blob = await blobFor(id);
    const path = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = path; a.download = id + "." + (blob.type.split("/")[1]?.split(";")[0] || "bin"); a.click();
    setTimeout(() => URL.revokeObjectURL(path), 30000);
  }
  return <section className="rounded-card border border-line bg-surface p-3 text-sm">
    <strong>{row.projectName} · {row.day} {row.at}</strong>
    <p role="status">{busy ? "Uploading capture…" : "Pending upload"} · {row.photos.length} photo(s){row.hasAudio && " · voice note"}</p>
    {error && <p role="alert">{error}</p>}
    {!busy && <>
      <button type="button" className={secondary} onClick={onRetry}>Retry upload</button>
      <details><summary className="cursor-pointer py-2">Review originals</summary>
        {row.photos.map((id,i) => <button type="button" className={secondary} key={id} onClick={() => void download(id)}>Download photo {i+1}</button>)}
        {row.hasAudio && <>
          <button type="button" className={secondary} onClick={async () => setUrl(URL.createObjectURL(await blobFor(row.id)))}><Mic className="inline size-4" /> Listen to recording</button>
          <button type="button" className={secondary} onClick={() => void download(row.id)}>Download voice note</button>
          {url && <audio controls autoPlay src={url} className="w-full" />}
          <label className="block">Report wording (optional)<textarea className="block w-full border p-2" value={row.text} onChange={e => onNote(e.target.value)} /></label>
        </>}
      </details>
    </>}
  </section>;
}
