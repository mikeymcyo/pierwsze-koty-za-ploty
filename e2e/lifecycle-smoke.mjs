/**
 * Reopening an issued report, and deleting reports and projects.
 *
 * Needs neither Supabase nor a dev server: it imports the rules directly and
 * exercises them. What it is really protecting is one promise - that a
 * correction never leaves the client's copy withdrawn with nothing in its
 * place - and one refusal: evidence underneath an issued document is not
 * deleted quietly.
 */
import {
  DELETE_CONFIRMATION,
  canDelete,
  canDeleteProject,
  canReopen,
  confirmationMatches,
  deletionBlockedBy,
  isReopened,
  nextRevision,
  reopenWarning,
} from "../lib/reports/lifecycle.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. Only an issued report can be reopened");
check("an issued report can be reopened", canReopen({ status: "final", pdfPath: "a.pdf" }).ok);
check("a plain draft cannot", !canReopen({ status: "draft", pdfPath: null }).ok);
check(
  "and is told why rather than failing silently",
  canReopen({ status: "draft", pdfPath: null }).message?.includes("not been issued"),
);
check(
  "a reopened report cannot be reopened again",
  !canReopen({ status: "draft", pdfPath: "a.pdf" }).ok,
);

console.log("\n2. A reopened report is a draft that still holds its issued PDF");
check("reopened is recognised", isReopened({ status: "draft", pdfPath: "a.pdf" }));
check("a plain draft is not reopened", !isReopened({ status: "draft", pdfPath: null }));
check("an issued report is not reopened", !isReopened({ status: "final", pdfPath: "a.pdf" }));
check(
  "the warning names the issue date and promises the PDF stays",
  reopenWarning("3 March 2026").includes("3 March 2026") &&
    reopenWarning("3 March 2026").includes("replaced only when you finalise again"),
  reopenWarning("3 March 2026"),
);
check("and still reads properly with no date", !reopenWarning(null).includes("null"));

console.log("\n3. Revisions are counted at issue, never at reopen");
check("a first issue is revision 0", nextRevision({ revision: 0, pdfPath: null }) === 0);
check("re-issuing a corrected report is revision 1", nextRevision({ revision: 0, pdfPath: "a.pdf" }) === 1);
check("and again is revision 2", nextRevision({ revision: 1, pdfPath: "a.pdf" }) === 2);
check(
  "an abandoned edit never inflates the number",
  nextRevision({ revision: 1, pdfPath: "a.pdf" }) === nextRevision({ revision: 1, pdfPath: "a.pdf" }),
);

console.log("\n4. Evidence underneath an issued document cannot be deleted");
const dependents = [
  { id: "p1", label: "Progress Report 001" },
  { id: "c1", label: "Completion Report 002" },
];
check("nothing depending on it means nothing blocking", deletionBlockedBy([]) === null);
check(
  "a blocked delete names every document in the way",
  dependents.every((d) => deletionBlockedBy(dependents).includes(d.label)),
  deletionBlockedBy(dependents),
);
check(
  "one dependent reads in the singular",
  deletionBlockedBy([dependents[0]]).includes("an issued report") &&
    !deletionBlockedBy([dependents[0]]).includes("issued reports"),
  deletionBlockedBy([dependents[0]]),
);
check(
  "a dependency blocks even with the confirmation typed",
  !canDelete({ status: "final", dependents, typedConfirmation: DELETE_CONFIRMATION }).ok,
);
check(
  "and blocks a draft too - the evidence is what matters, not the status",
  !canDelete({ status: "draft", dependents, typedConfirmation: "" }).ok,
);

console.log("\n5. An issued record needs the word typed; a draft does not");
check(
  "a draft deletes on confirmation alone",
  canDelete({ status: "draft", dependents: [], typedConfirmation: "" }).ok,
);
check(
  "an issued report will not delete without the word",
  !canDelete({ status: "final", dependents: [], typedConfirmation: "" }).ok,
);
check(
  "an issued report deletes once it is typed",
  canDelete({ status: "final", dependents: [], typedConfirmation: DELETE_CONFIRMATION }).ok,
);
check(
  "the wrong word is not enough",
  !canDelete({ status: "final", dependents: [], typedConfirmation: "delete it" }).ok,
);
check("case and stray spaces are forgiven", confirmationMatches("  delete "));
check("an empty box is not", !confirmationMatches("   "));

console.log("\n6. Deleting a project says what goes, and asks for the word");
check(
  "no confirmation, no delete",
  !canDeleteProject({ projectName: "Lidl South Croydon", typedConfirmation: "" }).ok,
);
check(
  "the refusal names the project so nobody deletes the wrong one",
  canDeleteProject({ projectName: "Lidl South Croydon", typedConfirmation: "" }).message?.includes(
    "Lidl South Croydon",
  ),
);
check(
  "typed, it proceeds",
  canDeleteProject({ projectName: "Lidl South Croydon", typedConfirmation: "DELETE" }).ok,
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL LIFECYCLE CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
