/**
 * Site Capture as a message: one box, the microphone and the arrow inside it.
 *
 * What must hold: what is said reaches the report. Spoken words are kept on
 * the phone exactly as typed ones are; the arrow sends them through the one
 * capture path; and Prepare Daily adds whatever is still in the box before it
 * writes - through that same path, confirmed by the server before the phone's
 * copy goes, and never preparing a Daily that is missing the last thing said.
 *
 * The order save → confirm → clear → prepare is a pure function and is run
 * here with the pieces stubbed. The wiring is read from source.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:capture-composer
 */

import { readFileSync } from "node:fs";

import { ACTION_UNREACHABLE, describeActionFailure } from "../lib/actions/recover.ts";
import {
  clearCaptureDraft,
  readCaptureBusy,
  readCaptureDraft,
  resetCaptureDraftSnapshots,
  setCaptureBusy,
  subscribeToCaptureDraft,
  writeCaptureDraft,
} from "../lib/capture-draft.ts";
import { UNSENT_NOT_SAVED, clockNow, saveUnsentThenPrepare } from "../lib/reports/prepare-with-pending.ts";
import { NOTHING_HEARD_MESSAGE, canSendCapture, composerDisplay } from "../lib/speech/transcript.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

/** A run of saveUnsentThenPrepare with every piece recorded. */
async function run({ text, saveResult, saveThrows, prepareThrows } = {}) {
  const log = [];
  const busyWhileSaving = [];
  const outcome = await saveUnsentThenPrepare({
    pending: { text, at: "08:14" },
    save: async (pending) => {
      log.push(["save", pending.text, pending.at]);
      busyWhileSaving.push(readCaptureBusy("r1"));
      if (saveThrows) throw saveThrows;
      return saveResult ?? { savedAt: "08:14" };
    },
    prepare: async () => {
      log.push(["prepare"]);
      if (prepareThrows) throw prepareThrows;
      return { questions: [] };
    },
    clearDraft: () => log.push(["clear"]),
    setBusy: (value) => setCaptureBusy("r1", value),
    describeFailure: describeActionFailure,
  }).catch((cause) => ({ kind: "threw", cause }));
  return { outcome, log, busyWhileSaving };
}

console.log("\n1. Nothing in the box: Prepare Daily runs as it always did");
{
  const empty = await run({ text: "" });
  check("no save, no clear, straight to prepare", JSON.stringify(empty.log) === JSON.stringify([["prepare"]]));
  check("and the prepare's answer is handed back", empty.outcome.kind === "prepared" && Array.isArray(empty.outcome.state.questions));
  const blank = await run({ text: "  \n " });
  check("whitespace alone is nothing to add", JSON.stringify(blank.log) === JSON.stringify([["prepare"]]));
}

console.log("\n2. Words still in the box: added first, confirmed, then prepared");
{
  resetCaptureDraftSnapshots();
  const spoken = await run({ text: "Skip swapped at eleven." });
  check(
    "save, then clear, then prepare - in that order",
    JSON.stringify(spoken.log) === JSON.stringify([["save", "Skip swapped at eleven.", "08:14"], ["clear"], ["prepare"]]),
    JSON.stringify(spoken.log),
  );
  check("the words go in as written, stamped with the phone's clock", spoken.log[0][1] === "Skip swapped at eleven." && spoken.log[0][2] === "08:14");
  check("the report is marked busy while the save is on its way", spoken.busyWhileSaving[0] === true);
  check("and not after", readCaptureBusy("r1") === false);
  check("the outcome is the prepare's", spoken.outcome.kind === "prepared");
}

console.log("\n3. The save fails: the words stay, nothing is prepared");
{
  resetCaptureDraftSnapshots();
  const refused = await run({ text: "Skip swapped at eleven.", saveResult: { error: "Could not save the capture: timeout" } });
  check("prepare is never called", !refused.log.some(([step]) => step === "prepare"));
  check("the phone's copy is never cleared", !refused.log.some(([step]) => step === "clear"));
  check("the outcome says not saved", refused.outcome.kind === "not_saved");
  check("in words that say the Daily was not prepared and the text is still there", /was not prepared/.test(refused.outcome.error) && /still there/.test(refused.outcome.error));
  check("and carries the capture's own reason", /timeout/.test(refused.outcome.error));
  check("busy is released", readCaptureBusy("r1") === false);

  const unreachable = await run({ text: "Skip swapped at eleven.", saveThrows: new TypeError("Failed to fetch") });
  check("a request that never arrived counts as not saved", unreachable.outcome.kind === "not_saved" && !unreachable.log.some(([step]) => step === "prepare"));
  check("with the network wording the rest of the app uses", unreachable.outcome.error.includes(ACTION_UNREACHABLE));
  check("busy is released after a throw too", readCaptureBusy("r1") === false);
  check("the shared wording exists once", /could not be added, so today's Daily was not prepared/.test(UNSENT_NOT_SAVED));
}

console.log("\n4. A redirect out of prepare passes through, after the clear");
{
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/reports/r1;307;" });
  const opened = await run({ text: "Done for the day.", prepareThrows: redirect });
  check("the redirect is not swallowed", opened.outcome.kind === "threw" && opened.outcome.cause === redirect);
  check("and the box was already emptied, so the words cannot come back", JSON.stringify(opened.log.map(([s]) => s)) === JSON.stringify(["save", "clear", "prepare"]));
}

console.log("\n5. The phone's clock, as the log writes it");
check("eight fourteen", clockNow(new Date(2026, 9, 8, 8, 14)) === "08:14");
check("one minute past midnight", clockNow(new Date(2026, 9, 8, 0, 1)) === "00:01");
check("the capture form stamps the same way", /capturedAt\.current\.value = clockNow\(\)/.test(read("../components/reports/site-capture-form.tsx")));

console.log("\n6. The busy flag: one request at a time from the same thumb");
{
  resetCaptureDraftSnapshots();
  let notified = 0;
  const stop = subscribeToCaptureDraft(() => (notified += 1));
  check("not busy to begin with", readCaptureBusy("r1") === false);
  setCaptureBusy("r1", true);
  check("busy when set", readCaptureBusy("r1") === true && notified === 1);
  setCaptureBusy("r1", true);
  check("setting it again says nothing", notified === 1);
  check("and is per report", readCaptureBusy("r2") === false);
  setCaptureBusy("r1", false);
  check("released", readCaptureBusy("r1") === false && notified === 2);
  stop();
}

console.log("\n7. Spoken words are kept on the phone exactly as typed ones");
{
  const dictation = read("../components/reports/dictation-field.tsx");
  check(
    "a dictated chunk goes through setText, the same path as a keystroke",
    /onText: \(chunk\) => setText\(joinTranscript\(latest\.current, chunk\)\)/.test(dictation),
    "it used to call setOwn alone and never reached onValueChange",
  );
  check("and setText tells the owner", /const setText = \(next: string\) => \{[\s\S]*?onValueChange\?\.\(next\);/.test(dictation));
  check("each chunk builds on the latest text, not the last render's", /latest\.current = next;/.test(dictation));

  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    },
    addEventListener() {},
    removeEventListener() {},
  };
  resetCaptureDraftSnapshots();
  writeCaptureDraft("r1", "Two electricians on site from seven.");
  check("what the owner is told lands on the phone", memory.get("siteboss:capture:r1") === "Two electricians on site from seven.");
  resetCaptureDraftSnapshots();
  check("and comes back to a fresh screen", readCaptureDraft("r1") === "Two electricians on site from seven.");
  clearCaptureDraft("r1");
  check("until the server has it", readCaptureDraft("r1") === "" && !memory.has("siteboss:capture:r1"));
  delete globalThis.window;
}

console.log("\n8. The composer, read from source");
{
  const dictation = read("../components/reports/dictation-field.tsx");
  const composer = dictation.slice(dictation.indexOf("function Composer("));
  const send = dictation.slice(dictation.indexOf("function SendButton("), dictation.indexOf("function Composer("));
  check("the arrow is the form's submit", /type="submit"/.test(send) && /data-composer-send/.test(send));
  check(
    "dead with nothing to send, while sending, while busy, and while dictation is unfinished",
    /disabled=\{!canSendCapture\(\{ text, listening, settling, pending, busy: disabled \}\)\}/.test(send),
  );
  check("it reads the form it sits in", /useFormStatus\(\)/.test(send));
  check("yellow, and a thumb's size", /bg-brand/.test(send) && /size-11/.test(send));
  check("the microphone is inside the box too, a thumb's size", /aria-pressed=\{listening\}/.test(composer) && /size-11/.test(composer));
  check("the box grows with what is said, to a ceiling", /COMPOSER_MAX_HEIGHT_PX/.test(composer) && /element\.scrollHeight/.test(composer));
  const textareaClass = composer.slice(composer.indexOf("<Textarea")).match(/className="([^"]*)"/)?.[1] ?? "";
  check(
    "and never sets a font size under the iOS floor",
    textareaClass.length > 0 && !/text-(base|sm|xs|\[)/.test(textareaClass),
    "iOS zooms the page when a focused field is under 16px",
  );
  check("the controls sit inside the bottom edge, so nothing scrolls sideways", /absolute inset-x-0 bottom-0/.test(composer) && /pb-16/.test(composer));
  check("without the API, the keyboard microphone is pointed at", /microphone on your keyboard/.test(composer));
  check("other screens still get the layout they had", /prominent\s*\? "flex flex-col items-stretch gap-3"/.test(dictation));
}

console.log("\n9. Site Capture wired as the one box");
{
  const form = read("../components/reports/site-capture-form.tsx");
  const prepare = read("../components/reports/prepare-daily.tsx");
  const page = read("../app/(app)/reports/[id]/capture/page.tsx");
  const actions = read("../app/(app)/reports/capture-actions.ts");

  check("the form asks for the composer", /<DictationField\s+composer/.test(form));
  check("and has no Add note button of its own", !/Add note/.test(form) && !/SaveButton/.test(form));
  check("the box is controlled from the phone's copy", /value=\{text\}/.test(form) && /readCaptureDraft\(reportId\)/.test(form));
  check("every change, typed or spoken, is written to it", /onValueChange=\{\(value\) => writeCaptureDraft\(reportId, value\)\}/.test(form));
  check("it is emptied only when the server confirmed", /const landed = !state\.error && state\.savedAt !== undefined/.test(form) && /if \(landed\) clearCaptureDraft\(reportId\)/.test(form));
  check("the arrow is dead while Prepare Daily is adding the unsent words", /disabled=\{busy\}/.test(form));
  check("and the form says when its own capture is on its way", /setCaptureBusy\(reportId, pending\)/.test(form));
  check("a saving state, small, and only while saving", /if \(pending\) return <span className="text-xs text-ink-subtle">Saving…<\/span>/.test(form));
  check("the failure keeps the words and says so", /Not saved - your words are safe here/.test(form) && /state\.error \? <Alert tone="danger">/.test(form));

  check("Prepare Daily adds the unsent words through the same capture action", /import \{ addCapture \}/.test(prepare) && /saveUnsentThenPrepare/.test(prepare));
  check("as a capture_text with the phone's clock", /capture\.set\("capture_text", text\)/.test(prepare) && /capture\.set\("captured_at", at\)/.test(prepare));
  check("clearing the phone's copy only through the tested order", /clearDraft: \(\) => clearCaptureDraft\(reportId\)/.test(prepare) && !/clearCaptureDraft\(reportId\)\s*;/.test(prepare.replace(/clearDraft: \(\) => clearCaptureDraft\(reportId\),/, "")));
  check("both buttons share one pending flag", /const \[state, action, pending\] = useRecoverableActionState/.test(prepare) && (prepare.match(/pending=\{pending\}/g) ?? []).length === 2);
  check("and both wait while the arrow's capture is on its way", (prepare.match(/disabled=\{busy \|\| dictating\}/g) ?? []).length === 2);
  check("the questions point at the box", /Answer in the box at the top/.test(prepare));

  check("the capture action is untouched: the same append, the same refusal of a repeat", /alreadyEnded\(current\.raw_notes, parsed\.data\.text, parsed\.data\.at\)/.test(actions) && /APPEND_ATTEMPTS/.test(actions));
  check("the page hands the form only its action and report", /<SiteCaptureForm action=\{addCapture\.bind\(null, report\.id\)\} reportId=\{report\.id\} \/>/.test(page));
  check("Prepare Daily is still the last thing on the screen", page.lastIndexOf("<PrepareDaily") > page.lastIndexOf("<DocumentUpload"));
  check("the day so far is still read from the server, never the phone", /parseCaptureLog\(report\.raw_notes\)/.test(page));
}

console.log("\n10. What the box shows while the microphone is on (real iPhone, 8 October)");
{
  // On iOS nearly everything said arrives as interim until the session ends.
  // The box used to show only final text, so a whole sentence looked lost.
  check("interim words are shown after the settled ones", composerDisplay("Stripped out the counters.", "Two electricians", true) === "Stripped out the counters. Two electricians");
  check("with nothing settled yet, the interim words are the box", composerDisplay("", "Stripped out", true) === "Stripped out");
  check("once the microphone is off, only the kept text is shown", composerDisplay("Kept.", "stale interim", false) === "Kept.");
  check("an empty interim adds nothing", composerDisplay("Kept.", "  ", true) === "Kept.");

  const base = { text: "Skip swapped at 11.", listening: false, settling: false, pending: false, busy: false };
  check("a finished note can be sent", canSendCapture(base));
  check("not while listening", !canSendCapture({ ...base, listening: true }));
  check("not while the last words are still on their way", !canSendCapture({ ...base, settling: true }));
  check("not while a send is pending", !canSendCapture({ ...base, pending: true }));
  check("not while Prepare Daily is adding it", !canSendCapture({ ...base, busy: true }));
  check("not with nothing in it", !canSendCapture({ ...base, text: "  " }));
  check("nothing heard says nothing was added", /nothing was added/.test(NOTHING_HEARD_MESSAGE) && !/saved|captured/i.test(NOTHING_HEARD_MESSAGE));

  const hook = read("../lib/hooks/use-speech-input.ts");
  const dictation = read("../components/reports/dictation-field.tsx");
  const prepare = read("../components/reports/prepare-daily.tsx");
  const page = read("../app/(app)/reports/[id]/capture/page.tsx");
  check("the hook hands out what it is hearing", /setInterim\(state\.pending\)/.test(hook) && /interim, error, start, stop/.test(hook));
  check("stop waits for the last words rather than declaring itself done", /setSettling\(true\);\s*recognition\.stop\(\);/.test(hook));
  check("and cannot hang if the recogniser never ends", /SETTLE_TIMEOUT_MS/.test(hook) && /endSession\(sessionRef\.current\)/.test(hook.slice(hook.indexOf("settleTimerRef.current = setTimeout"))));
  check("nothing heard across a whole press is reported", /heardSinceStartRef/.test(hook) && /current \?\? NOTHING_HEARD_MESSAGE/.test(hook));
  check("without hiding a permission error", (hook.match(/current \?\? NOTHING_HEARD_MESSAGE/g) ?? []).length === 2);
  check("the composer shows the live words and is read-only meanwhile", /value=\{shown\}/.test(dictation) && /readOnly=\{active\}/.test(dictation));
  check("the arrow asks canSendCapture", /disabled=\{!canSendCapture\(/.test(dictation));
  check("Prepare Daily waits while the microphone is on", (prepare.match(/disabled=\{busy \|\| dictating\}/g) ?? []).length === 2);
  check("Today so far opens once there is a note", /open=\{entries\.length > 0\}/.test(page));
  check("and shows each note in full, not a 160-character preview", /\{entry\.text\}/.test(page) && !/capturePreview\(/.test(page));
}

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL CAPTURE COMPOSER CHECKS PASSED");
else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
