/**
 * The build marker on the profile screen.
 *
 * It exists because there was no way to tell from a phone which commit a
 * Preview was running, so a deployment that had not picked up a change looked
 * exactly like a change that had not worked. These checks keep it honest: a
 * short SHA when Vercel gives one, nothing at all when it does not, and never
 * anything else out of the environment.
 *
 *   npm run test:build-ref
 */

import { readFileSync } from "node:fs";

import { BUILD_REF_LENGTH, shortBuildRef } from "../lib/build-info.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const SHA = "053fcb721733884f5e5cb3c3646c29d1e9f713f4";

console.log("\n1. On Vercel it names the commit");
check("it shortens the SHA", shortBuildRef({ VERCEL_GIT_COMMIT_SHA: SHA }) === "053fcb7");
check("seven characters", BUILD_REF_LENGTH === 7);
check(
  "an already-short SHA is left alone",
  shortBuildRef({ VERCEL_GIT_COMMIT_SHA: "1d9474e" }) === "1d9474e",
);
check(
  "an uppercase SHA is normalised",
  shortBuildRef({ VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase() }) === "053fcb7",
);
check(
  "surrounding whitespace is trimmed",
  shortBuildRef({ VERCEL_GIT_COMMIT_SHA: `  ${SHA}\n` }) === "053fcb7",
);

console.log("\n2. Off Vercel it says nothing rather than inventing a placeholder");
for (const [label, env] of [
  ["the variable is absent", {}],
  ["the variable is empty", { VERCEL_GIT_COMMIT_SHA: "" }],
  ["the variable is whitespace", { VERCEL_GIT_COMMIT_SHA: "   " }],
  ["it is not a SHA", { VERCEL_GIT_COMMIT_SHA: "main" }],
  ["it is too short to be one", { VERCEL_GIT_COMMIT_SHA: "abc" }],
  ["it carries something that is not hex", { VERCEL_GIT_COMMIT_SHA: "not-a-sha-zzzz" }],
]) {
  check(`null when ${label}`, shortBuildRef(env) === null, String(shortBuildRef(env)));
}

console.log("\n3. It exposes nothing else from the environment");
const source = readFileSync(new URL("../lib/build-info.ts", import.meta.url), "utf8");
const referenced = [...source.matchAll(/VERCEL_[A-Z_]+|OPENAI_[A-Z_]+|SUPABASE_[A-Z_]+|SERVICE_ROLE/g)]
  .map((match) => match[0]);
check(
  "only the commit SHA is read",
  referenced.every((name) => name === "VERCEL_GIT_COMMIT_SHA"),
  [...new Set(referenced)].join(", "),
);
// Uppercase identifiers only: the prose in that file says the SHA is not a
// secret, and matching the word would fail on its own explanation.
const sensitive = source.match(/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\b/g);
check("no credential-shaped variable is named", sensitive === null, String(sensitive));

// The page must render it only when there is one - a hardcoded fallback would
// make a local build claim to be a deployment.
const profile = readFileSync(new URL("../app/(app)/profile/page.tsx", import.meta.url), "utf8");
check("the profile page uses the helper", profile.includes("shortBuildRef("));
check(
  "and renders nothing without a ref",
  /buildRef \? \(/.test(profile) && profile.includes(": null}"),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL BUILD REF CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
