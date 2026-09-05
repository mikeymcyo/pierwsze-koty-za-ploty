/**
 * The first query after signing in, and the clock that rejects it.
 *
 * GoTrue mints the token and PostgREST checks it, and their clocks are not the
 * same clock. When they disagree the first query after sign-in comes back
 * "JWT issued at future", and before the retry that was a crashed dashboard.
 * Vercel's error log shows how real it is: nineteen in a week, seven people,
 * all on the screen right after sign-in, the last one past a six-second budget.
 *
 * What is checked: only that error is retried, it stops the moment the answer
 * arrives, every other error surfaces at once, the budget is honoured, and the
 * budget the app ships with is wide enough for the skew that has been seen.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:clock-skew
 */

import { readFileSync } from "node:fs";

import { withClockSkewRetry } from "../lib/supabase/retry.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const skew = { message: "JWT issued at future", details: "", hint: "", code: "PGRST301" };
const other = { message: "permission denied for table photos", details: "", hint: "", code: "42501" };

console.log("\n1. The clock error is retried until the answer arrives");
{
  let calls = 0;
  const result = await withClockSkewRetry(
    async () => (++calls < 3 ? { data: null, error: skew } : { data: { ok: true }, error: null }),
    { budgetMs: 5_000 },
  );
  check("it keeps asking while the clock says no", calls === 3, String(calls));
  check("and returns the answer, not the rejection", result.error === null && result.data?.ok === true);
}

console.log("\n2. Every other error comes straight back");
{
  let calls = 0;
  const result = await withClockSkewRetry(async () => (++calls, { data: null, error: other }), { budgetMs: 5_000 });
  check("a permissions error is not retried", calls === 1, String(calls));
  check("and is returned untouched", result.error === other);
}
{
  let calls = 0;
  await withClockSkewRetry(async () => (++calls, { data: [], error: null }), { budgetMs: 5_000 });
  check("a plain success asks once", calls === 1, String(calls));
}

console.log("\n3. The budget is a deadline, not a hope");
{
  let calls = 0;
  const started = Date.now();
  const result = await withClockSkewRetry(async () => (++calls, { data: null, error: skew }), { budgetMs: 900 });
  const took = Date.now() - started;
  check("it gives up inside the budget", took < 1_500, `${took}ms`);
  check("after more than one attempt", calls > 1, String(calls));
  check("and hands back the last rejection rather than inventing an answer", result.error?.message === skew.message);
}
{
  // Hint text counts too: PostgREST sometimes puts the clock complaint there.
  let calls = 0;
  await withClockSkewRetry(
    async () => (++calls < 2 ? { data: null, error: { ...other, message: "", hint: "iat is in the future" } } : { data: 1, error: null }),
    { budgetMs: 5_000 },
  );
  check("the hint is read as well as the message", calls === 2, String(calls));
}

console.log("\n4. The budget the app ships with covers the skew that has been seen");
const source = read("../lib/supabase/retry.ts");
const budget = Number(source.match(/DEFAULT_BUDGET_MS = ([\d_]+);/)?.[1].replace(/_/g, ""));
check("a default budget is declared", Number.isFinite(budget), String(budget));
// The one that got through on 5 September 2026 outlasted six seconds.
check("it is longer than the six seconds that was not enough", budget > 6_000, String(budget));
check("and not so long it outlives a serverless function", budget <= 25_000, String(budget));
check("the first screen after sign-in still uses it", /withClockSkewRetry\(/.test(read("../lib/auth/session.ts")));

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL CLOCK SKEW CHECKS PASSED");
else { for (const f of failures) console.log(`FAILED: ${f}`); process.exitCode = 1; }
