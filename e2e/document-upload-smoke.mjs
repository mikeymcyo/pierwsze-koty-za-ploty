/**
 * Which files the document uploader accepts, and what the iOS picker asks for.
 *
 * The bug this guards is real and was found on an iPad: with
 * `accept="application/pdf"` the Files browser greyed out genuine PDFs in
 * Recents, iCloud Drive, Downloads and Inbox alike, because Safari maps a
 * concrete MIME type to a UTI and providers frequently declare none. Needs
 * neither Supabase nor a browser.
 */
import { readFileSync } from "node:fs";

import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  PDF_CONTENT_TYPE,
  PDF_SIGNATURE_BYTES,
  checkDocumentFile,
  describeUploadOutcome,
  hasPdfExtension,
  hasPdfSignature,
} from "../lib/documents/file-validation.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

/** "%PDF-" - the first five bytes of every PDF. */
const PDF_HEAD = [0x25, 0x50, 0x44, 0x46, 0x2d];
/** A PNG's first five bytes, for a file wearing the wrong name. */
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d];
const ONE_MB = 1024 * 1024;

console.log("\n1. The picker asks for an extension, never a MIME type");
check("accept is exactly .pdf", DOCUMENT_ACCEPT === ".pdf", DOCUMENT_ACCEPT);
check(
  "it names no MIME type at all - that is what greyed files out on the iPad",
  !DOCUMENT_ACCEPT.includes("/"),
  DOCUMENT_ACCEPT,
);
check(
  "and the input in the uploader uses it rather than a literal",
  /accept=\{DOCUMENT_ACCEPT\}/.test(
    readFileSync(new URL("../components/documents/document-upload.tsx", import.meta.url), "utf8"),
  ),
);

console.log("\n2. A genuine PDF is accepted however the device describes it");
for (const [what, type] of [
  ["application/pdf", "application/pdf"],
  ["a blank MIME type, as iCloud Drive often gives", ""],
  ["application/octet-stream", "application/octet-stream"],
  ["binary/octet-stream", "binary/octet-stream"],
  ["application/x-pdf", "application/x-pdf"],
]) {
  check(
    `accepted with ${what}`,
    checkDocumentFile({ name: "GA-Plan-Rev-C.pdf", size: 2 * ONE_MB, type }, PDF_HEAD).ok,
  );
}
check(
  "an uppercase extension is still a PDF",
  checkDocumentFile({ name: "RAMS.PDF", size: ONE_MB, type: "" }, PDF_HEAD).ok,
);
check(
  "and so is one whose name has spaces and dots",
  checkDocumentFile({ name: "Method Statement v2.1.pdf", size: ONE_MB, type: "" }, PDF_HEAD).ok,
);

console.log("\n3. Signature validation catches a file wearing the wrong name");
const renamed = checkDocumentFile(
  { name: "totally-a-drawing.pdf", size: ONE_MB, type: "application/pdf" },
  PNG_HEAD,
);
check("a PNG renamed .pdf is refused", !renamed.ok);
check(
  "and is told what is actually wrong",
  !renamed.ok && /contents are not a PDF/i.test(renamed.reason),
  renamed.ok ? "" : renamed.reason,
);
check(
  "even when the device confidently claims application/pdf",
  !checkDocumentFile({ name: "x.pdf", size: ONE_MB, type: "application/pdf" }, PNG_HEAD).ok,
);
check("the signature helper reads %PDF-", hasPdfSignature(PDF_HEAD) && !hasPdfSignature(PNG_HEAD));
check("and refuses a truncated read rather than guessing", !hasPdfSignature([0x25, 0x50]));
check("five bytes is what the uploader must read", PDF_SIGNATURE_BYTES === 5);

console.log("\n4. Where the bytes cannot be read, the name and type decide");
check(
  "a PDF with an unreadable head is still accepted",
  checkDocumentFile({ name: "drawing.pdf", size: ONE_MB, type: "" }, null).ok,
);
check(
  "but a device naming another format is believed",
  !checkDocumentFile({ name: "drawing.pdf", size: ONE_MB, type: "image/png" }, null).ok,
);
check(
  "a non-PDF name is refused before anything else is considered",
  !checkDocumentFile({ name: "photo.jpg", size: ONE_MB, type: "application/pdf" }, PDF_HEAD).ok,
);
check("hasPdfExtension is case-insensitive", hasPdfExtension("a.PdF") && !hasPdfExtension("a.pdf.exe"));

console.log("\n5. The 25 MB limit is preserved");
check("the limit matches the bucket", DOCUMENT_MAX_BYTES === 25 * 1024 * 1024);
check(
  "a file over it is refused",
  !checkDocumentFile(
    { name: "big.pdf", size: DOCUMENT_MAX_BYTES + 1, type: "application/pdf" },
    PDF_HEAD,
  ).ok,
);
check(
  "and the message says what to do about it",
  /larger than 25 MB/i.test(
    checkDocumentFile(
      { name: "big.pdf", size: DOCUMENT_MAX_BYTES + 1, type: "application/pdf" },
      PDF_HEAD,
    ).reason,
  ),
);
check(
  "a file exactly on the limit is allowed",
  checkDocumentFile({ name: "ok.pdf", size: DOCUMENT_MAX_BYTES, type: "" }, PDF_HEAD).ok,
);
check(
  "an empty file is refused",
  !checkDocumentFile({ name: "empty.pdf", size: 0, type: "application/pdf" }, PDF_HEAD).ok,
);

console.log("\n6. The stored object is always a PDF content type");
check("normalised to application/pdf", PDF_CONTENT_TYPE === "application/pdf");
const uploader = readFileSync(
  new URL("../components/documents/document-upload.tsx", import.meta.url),
  "utf8",
);
check(
  "the upload asserts it rather than passing the device's guess through",
  /contentType: PDF_CONTENT_TYPE/.test(uploader),
);
check(
  "and the recorded row says the same",
  /mimeType: PDF_CONTENT_TYPE/.test(uploader),
);
check(
  "every file is checked before it is uploaded",
  /checkDocumentFile\(file, await readSignature\(file\)\)/.test(uploader),
);

console.log("\n7. The person holding the iPad is told what happened");
check("nothing to say when everything worked", describeUploadOutcome({ uploaded: 2, failures: [] }) === null);
check(
  "a total failure quotes the reason, not a count",
  describeUploadOutcome({ uploaded: 0, failures: ["big.pdf is larger than 25 MB."] }) ===
    "Nothing uploaded. big.pdf is larger than 25 MB.",
);
check(
  "a partial failure says how many got through",
  /^1 uploaded\. /.test(describeUploadOutcome({ uploaded: 1, failures: ["x.pdf is empty."] })),
);
check(
  "and mentions that there were others",
  /2 more had problems/.test(
    describeUploadOutcome({ uploaded: 1, failures: ["a", "b", "c"] }),
  ),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL DOCUMENT UPLOAD CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
