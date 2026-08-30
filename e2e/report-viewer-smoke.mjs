/**
 * Guard test for what the full-screen report reader is pointed at.
 *
 * Needs neither Supabase nor a dev server. The rule it protects is the one
 * that keeps an issued document immutable: the reader draws whatever bytes it
 * is handed, so if the wrong URL reaches it, a document somebody was sent
 * quietly becomes a render of today's data - which is the one thing issuing is
 * supposed to prevent.
 *
 *   npm run test:viewer
 */

import { viewerSource } from "../lib/pdf/viewer-source.ts";
import { isReopened } from "../lib/reports/lifecycle.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

/** As the pages call it: the reopened rule stays in lib/reports/lifecycle.ts. */
function sourceFor(base, state) {
  return viewerSource(base, {
    ...state,
    reopened: isReopened({ status: state.status, pdfPath: state.pdfPath }),
  });
}

const BASES = ["/reports/abc", "/summary-reports/abc"];

console.log("\n1. An issued report is read from storage, never re-rendered");
for (const base of BASES) {
  const issued = sourceFor(base, { status: "final", pdfPath: "co/proj/r.pdf", wantsDraft: false });
  check(`${base}: final is the issued record`, issued.showingIssued === true);
  check(`${base}: final reads the stored file`, issued.src === `${base}/file`, String(issued.src));
  check(
    `${base}: final never reaches the renderer`,
    !String(issued.src).includes("/preview"),
    String(issued.src),
  );
}

console.log("\n2. Asking for a draft cannot turn an issued report into a render");
for (const base of BASES) {
  const issued = sourceFor(base, { status: "final", pdfPath: "co/proj/r.pdf", wantsDraft: true });
  check(`${base}: ?draft=1 is ignored on a final report`, issued.src === `${base}/file`, String(issued.src));
}

console.log("\n3. A draft goes through the ordinary preview path");
for (const base of BASES) {
  const draft = sourceFor(base, {
    status: "draft",
    pdfPath: null,
    wantsDraft: false,
    previewQuery: "style=house",
  });
  check(`${base}: a draft is not the issued record`, draft.showingIssued === false);
  check(
    `${base}: a draft renders a preview`,
    draft.src === `${base}/preview?draft=1&style=house`,
    String(draft.src),
  );
}

console.log("\n4. A reopened report shows the PDF its client still holds");
for (const base of BASES) {
  const reopened = { status: "draft", pdfPath: "co/proj/r.pdf" };
  const byDefault = sourceFor(base, { ...reopened, wantsDraft: false });
  check(
    `${base}: by default, the already-issued file`,
    byDefault.showingIssued === true && byDefault.src === `${base}/file`,
    String(byDefault.src),
  );

  const corrections = sourceFor(base, {
    ...reopened,
    wantsDraft: true,
    previewQuery: "documents=0&style=house",
  });
  check(
    `${base}: on request, a preview of the corrections`,
    corrections.showingIssued === false &&
      corrections.src === `${base}/preview?draft=1&documents=0&style=house`,
    String(corrections.src),
  );
}

console.log("\n5. A missing stored file is said so, not rendered around");
for (const base of BASES) {
  const missing = sourceFor(base, { status: "final", pdfPath: null, wantsDraft: false });
  check(
    `${base}: no path means nothing to show`,
    missing.showingIssued === true && missing.src === null,
    String(missing.src),
  );
}

console.log("\n6. Every source is same-origin, so it can be drawn and shared");
for (const base of BASES) {
  for (const state of [
    { status: "final", pdfPath: "p.pdf", wantsDraft: false },
    { status: "draft", pdfPath: null, wantsDraft: false },
    { status: "draft", pdfPath: "p.pdf", wantsDraft: true },
  ]) {
    const { src } = sourceFor(base, state);
    check(
      `${base}: ${state.status}${state.pdfPath ? " with a file" : ""}${state.wantsDraft ? ", corrections" : ""} stays on this origin`,
      src === null || src.startsWith("/"),
      String(src),
    );
  }
}

console.log(
  failures.length === 0
    ? "\n=== Result === ALL REPORT VIEWER CHECKS PASSED\n"
    : `\n=== Result === ${failures.length} CHECK(S) FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
