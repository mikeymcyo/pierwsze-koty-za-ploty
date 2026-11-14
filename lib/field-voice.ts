export type FieldVoice = {
  finish(): Promise<Blob>;
  cancel(): void;
};

/** Starts on the shutter gesture so the Home Screen app can request microphone access. */
export async function startFieldVoice(onCheckpoint?: (audio: Blob) => void): Promise<FieldVoice> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Voice recording is unavailable on this device. Type your note instead.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () => stream.getTracks().forEach(track => track.stop());
  try {
    const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
      .find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 64000 });
    const chunks: Blob[] = [];
    let cancelled = false;
    let stopped!: () => void;
    const complete = new Promise<void>(resolve => { stopped = resolve; });
    const audio = () => new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || "audio/mp4" });
    function stop() {
      if (recorder.state !== "inactive") recorder.stop();
    }

    recorder.ondataavailable = event => {
      if (cancelled || !event.data.size) return;
      chunks.push(event.data);
      onCheckpoint?.(audio());
    };
    recorder.onstop = () => {
      window.removeEventListener("pagehide", stop);
      release();
      stopped();
    };
    recorder.onerror = stop;
    recorder.start(1000);
    window.addEventListener("pagehide", stop, { once: true });
    return {
      async finish() {
        stop();
        await complete;
        if (!chunks.length || cancelled) throw new Error("No audio was recorded. Type your note instead.");
        return audio();
      },
      cancel() {
        cancelled = true;
        stop();
        release();
      },
    };
  } catch (cause) {
    release();
    throw cause;
  }
}

/** The caller keeps the original recording until the report acknowledges the note. */
export async function transcribeFieldVoice(audio: Blob): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/capture/transcribe", {
      method: "POST",
      headers: { "Content-Type": audio.type },
      body: audio,
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new Error("Could not reach transcription. Retry or play back the recording and type your note.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result?.text !== "string" || !result.text.trim()) {
    throw new Error(result?.error || "Transcription failed. Retry or play back the recording and type your note.");
  }
  return result.text.trim();
}
