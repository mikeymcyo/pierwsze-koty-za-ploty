/**
 * One real extraction against a real model, from a terminal.
 *
 *   OPENAI_API_KEY=sk-... npm run check:live-extraction
 *
 * The report itself lives in lib/documents/extraction-check.ts, because the
 * temporary validation page in Preview runs exactly the same thing - two
 * copies of the check would be two answers to the one question this exists to
 * settle.
 *
 * Touches no database, no storage and no project. With no key it calls nothing.
 */

import { runExtractionCheck } from "../lib/documents/extraction-check.ts";

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error(
    "\nNo OPENAI_API_KEY in the environment.\n\n" +
      "  OPENAI_API_KEY=sk-... npm run check:live-extraction\n\n" +
      "Nothing was called and nothing was written.",
  );
  process.exit(2);
}

const report = await runExtractionCheck();
console.log(report.text);
if (!report.ok) process.exitCode = 1;
