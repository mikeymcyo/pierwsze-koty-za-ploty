/**
 * Dictation transcript accumulation and restart policy.
 *
 * The bug these guard against cost a real report: on iOS Safari a recognition
 * session ends by itself after a pause, nothing restarted it, and the site
 * manager carried on talking into a microphone that had stopped. Thirty
 * seconds of dictation was stored as two sentences.
 *
 * Recovering from that means restarting, and restarting brings two hazards of
 * its own - results renumber from zero in the new session, and the phrase in
 * flight when a session ends never reaches isFinal. Both are simulated here
 * against the real module, so they need no device:
 *
 *   npm run test:dictation
 *
 * What cannot be tested here is Safari itself: whether it will start a session
 * from a timer rather than a tap. That is what the refusal path exists for.
 */

import {
  MAX_EMPTY_RESTARTS,
  RESTART_DELAYS_MS,
  RESTART_REFUSED_MESSAGE,
  decideRestart,
  endSession,
  joinTranscript,
  newSession,
  receive,
} from "../lib/speech/transcript.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

/** Builds the results array a recogniser hands over: finals, then one interim. */
function event(finals, interim = null) {
  const results = finals.map((transcript) => ({ isFinal: true, 0: { transcript } }));
  if (interim !== null) results.push({ isFinal: false, 0: { transcript: interim } });
  return { results: Object.assign(results, { length: results.length }) };
}

/**
 * Drives a whole dictation the way the hook does, so the cases below describe
 * what the site manager ends up with rather than what one function returned.
 */
function dictate(script) {
  let text = "";
  let state = newSession();
  let intent = true;
  let producedText = false;
  let emptyEnds = 0;
  const restarts = [];
  let stoppedBecause = null;

  const append = (chunk) => {
    if (!chunk) return;
    producedText = true;
    text = joinTranscript(text, chunk);
  };

  for (const step of script) {
    // Once dictation has given up the hook nulls the recogniser, so nothing
    // further reaches it. The harness has to stop too, or a later end would
    // overwrite the reason it stopped.
    if (stoppedBecause) break;

    if (step.speak) {
      const next = receive(state, event(step.speak.finals ?? [], step.speak.interim ?? null));
      state = next.state;
      append(next.append);
      continue;
    }

    if (step.userStops) intent = false;

    if (step.sessionEnds || step.userStops) {
      const ended = endSession(state);
      state = newSession();
      append(ended.append);

      emptyEnds = producedText ? 0 : emptyEnds + 1;
      const decision = decideRestart({ intent, consecutiveEmptyEnds: emptyEnds });

      if (decision.restart) {
        restarts.push(decision.delayMs);
        producedText = false;
      } else {
        stoppedBecause = decision.reason;
        intent = false;
      }
    }
  }

  return { text, restarts, stoppedBecause };
}

console.log("\n1. A session that ends after a pause is restarted, not abandoned");
const paused = dictate([
  { speak: { finals: ["Continued the drainage run along the eastern boundary."] } },
  // Safari gives up during the pause while he looks at the trench.
  { sessionEnds: true },
  { speak: { finals: ["Six groundworkers on site all day."] } },
  { sessionEnds: true },
  { speak: { finals: ["Concrete arrived at half ten."] } },
  { userStops: true },
]);
check(
  "everything spoken across three sessions is kept",
  paused.text ===
    "Continued the drainage run along the eastern boundary. Six groundworkers on site all day. Concrete arrived at half ten.",
  paused.text,
);
check("it restarted twice", paused.restarts.length === 2, JSON.stringify(paused.restarts));
check("and stopped only when asked", paused.stoppedBecause === "stopped");

console.log("\n2. Result indices start again at zero in a new session");
// The hazard: session two numbers its first result 0, exactly like session one.
let state = newSession();
const first = receive(state, event(["Scaffold struck to the north elevation."]));
check("session one is taken", first.append === "Scaffold struck to the north elevation.");
check("its watermark advances", first.state.committed === 1);

state = newSession();
const second = receive(state, event(["Gable end made good."]));
check("session two starts from zero", second.append === "Gable end made good.");
check(
  "the earlier session's text is not repeated",
  !second.append.includes("Scaffold"),
  second.append,
);

console.log("\n3. Interim text that never settles is still kept");
const cutOff = dictate([
  { speak: { finals: ["Plasterboard delivery booked in."] } },
  // Cut off mid sentence: this phrase never reaches isFinal.
  { speak: { finals: ["Plasterboard delivery booked in."], interim: "second fix starts Monday" } },
  { sessionEnds: true },
  { userStops: true },
]);
check(
  "the unfinished phrase survives the session ending",
  cutOff.text === "Plasterboard delivery booked in. second fix starts Monday",
  cutOff.text,
);

const settled = endSession({ committed: 1, pending: "" });
check("a session that settled cleanly appends nothing", settled.append === "");
check("and its state is reset for the next one", settled.state.committed === 0);

console.log("\n4. Final text is never appended twice");
// Engines differ on whether resultIndex means "new" or is always zero, so the
// same finals get re-delivered. The watermark is what makes that harmless.
let repeat = newSession();
const one = receive(repeat, event(["Excavation to the south bay."]));
repeat = one.state;
const two = receive(repeat, event(["Excavation to the south bay."], "and the "));
repeat = two.state;
const three = receive(repeat, event(["Excavation to the south bay.", "And the haul road was graded."]));

check("the first delivery is taken", one.append === "Excavation to the south bay.");
check("re-delivering it appends nothing", two.append === "", JSON.stringify(two.append));
check("an interim does not count as settled", two.state.committed === 1);
check(
  "only the genuinely new final is appended",
  three.append === "And the haul road was graded.",
  three.append,
);

const grown = dictate([
  { speak: { finals: ["One."] } },
  { speak: { finals: ["One.", "Two."] } },
  { speak: { finals: ["One.", "Two.", "Three."] } },
  { userStops: true },
]);
check("a growing results array reads once through", grown.text === "One. Two. Three.", grown.text);

console.log("\n5. Stopping means stopping");
const stopped = dictate([
  { speak: { finals: ["Site closed at four."], interim: "gates locked" } },
  { userStops: true },
]);
check(
  "the tail in flight is kept when the user stops",
  stopped.text === "Site closed at four. gates locked",
  stopped.text,
);
check("no restart is scheduled", stopped.restarts.length === 0);
check("and the reason is the user, not a fault", stopped.stoppedBecause === "stopped");
check(
  "intent decides it outright",
  decideRestart({ intent: false, consecutiveEmptyEnds: 0 }).restart === false,
);

console.log("\n6. A refusal surfaces instead of spinning");
// Safari declining to start outside a user gesture looks like this: end after
// end, immediately, with nothing recognised in between.
const refused = dictate([
  { sessionEnds: true },
  { sessionEnds: true },
  { sessionEnds: true },
  { sessionEnds: true },
]);
check(
  `it gives up after ${MAX_EMPTY_RESTARTS} empty sessions`,
  refused.restarts.length === MAX_EMPTY_RESTARTS,
  JSON.stringify(refused.restarts),
);
check("and says why", refused.stoppedBecause === "exhausted");
check(
  "the message tells the user what to do",
  /tap Dictate to continue/i.test(RESTART_REFUSED_MESSAGE),
  RESTART_REFUSED_MESSAGE,
);
check(
  "retries back off rather than hammering",
  RESTART_DELAYS_MS.every((delay, index) => index === 0 || delay > RESTART_DELAYS_MS[index - 1]),
  JSON.stringify(RESTART_DELAYS_MS),
);

// A silence long enough to end three sessions must not count against someone
// who then speaks: the counter resets on any text at all.
const spokeEventually = dictate([
  { sessionEnds: true },
  { sessionEnds: true },
  { speak: { finals: ["Right, where was I."] } },
  { sessionEnds: true },
  { sessionEnds: true },
  { speak: { finals: ["Muck away continues tomorrow."] } },
  { userStops: true },
]);
check(
  "speaking resets the give-up counter",
  spokeEventually.stoppedBecause === "stopped",
  String(spokeEventually.stoppedBecause),
);
check(
  "and nothing spoken is lost across all of it",
  spokeEventually.text === "Right, where was I. Muck away continues tomorrow.",
  spokeEventually.text,
);

console.log("\n7. Joining chunks");
check("the first chunk stands alone", joinTranscript("", "One.") === "One.");
check("later chunks are spaced once", joinTranscript("One.", "Two.") === "One. Two.");
check("existing whitespace is not doubled", joinTranscript("One. ", " Two.") === "One. Two.");
check("an empty chunk changes nothing", joinTranscript("One.", "   ") === "One.");
check("typed text is preserved", joinTranscript("Typed by hand.", "Spoken.") === "Typed by hand. Spoken.");

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL DICTATION CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
