import OpenAI from "openai";

import { getSessionContext } from "@/lib/auth/session";

const MAX_BYTES = 4_000_000;
const audioFormats = new Map([["audio/mp4", "m4a"], ["audio/webm", "webm"]]);

function problem(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return problem("Use SiteBoss to send a voice note.", 403);
  if (!(await getSessionContext())) return problem("Sign in again to transcribe this recording.", 401);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return problem("Transcription is unavailable. Play back your recording and type your note.", 503);

  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const extension = audioFormats.get(mime);
  if (!extension) return problem("This audio format cannot be transcribed. Play it back and type your note.", 415);
  const tooLong = "This recording is too long to transcribe. Play it back and type your note.";
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return problem(tooLong, 413);

  const reader = request.body?.getReader();
  if (!reader) return problem("The recording is empty.", 400);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return problem(tooLong, 413);
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!bytes) return problem("The recording is empty.", 400);

  const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined, timeout: 30_000, maxRetries: 0 });
  try {
    const result = await client.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: new File(chunks, `voice-note.${extension}`, { type: mime }),
      language: "en",
    }, { signal: request.signal });
    const text = result.text.trim();
    if (!text) return problem("No words were recognised. Play back the recording and type your note.", 422);
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return problem("Could not transcribe the recording. Retry or play it back and type your note.", 502);
  }
}
