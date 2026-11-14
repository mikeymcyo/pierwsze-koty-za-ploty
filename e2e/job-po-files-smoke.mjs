import assert from "node:assert/strict";
import { attachPoFile } from "../lib/jobs/attach-po.ts";
import { MAX_PO_PDF_BYTES, poPdfFilename, validatePoPdf } from "../lib/jobs/po-files.ts";

const company = "11111111-1111-4111-8111-111111111111";
const job = "22222222-2222-4222-8222-222222222222";
const po = "33333333-3333-4333-8333-333333333333";
const upload = "44444444-4444-4444-8444-444444444444";
const folder = `${company}/${job}`;
const path = `${folder}/${po}-${upload}.pdf`;
const old = `${folder}/${po}-55555555-5555-4555-8555-555555555555.pdf`;
const input = { poId: po, storagePath: path, expectedStoragePath: old, originalFilename: "PO.pdf", fileSize: 20 };

/** Exercise the real write sequence with failures injected at each boundary. */
function database(options = {}) {
  const events = [];
  const row = { id: po, job_id: job, company_id: company, storage_path: old, ...options.row };
  const client = {
    from(table) {
      assert.equal(table, "job_pos");
      let patch;
      const filters = [];
      const query = {
        select() { return query; },
        update(value) { patch = value; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        is(key, value) { filters.push([key, value]); return query; },
        async maybeSingle() {
          if (patch) {
            events.push("update");
            if (options.race) row.storage_path = "another-new-file.pdf";
            if (options.writeError) return { data: null, error: { message: "failed" } };
          } else events.push("read");
          if (!filters.every(([key, value]) => row[key] === value)) return { data: null, error: null };
          if (patch) Object.assign(row, patch);
          return { data: { ...row }, error: null };
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "job-pos");
        return {
          async list(dir, { search }) {
            events.push("list");
            assert.equal(dir, folder);
            assert.equal(search, path.slice(folder.length + 1));
            return { data: options.missing ? [] : [{ name: search, metadata: { size: 20, mimetype: "application/pdf", ...options.metadata } }], error: null };
          },
          async remove(paths) {
            events.push("remove");
            assert.deepEqual(paths, [old]);
            assert.equal(row.storage_path, path, "old file is only removed after the row moved");
            if (options.deleteError) throw new Error("storage unavailable");
            return { error: null };
          },
        };
      },
    },
  };
  return { client, events, row };
}

let count = 0;
async function check(label, run) {
  await run();
  count++;
  console.log(`PASS ${label}`);
}

await check("PDF picker checks bytes, empty files and the bucket limit", async () => {
  assert.equal(await validatePoPdf(new Blob(["%PDF-1.7\n"])), null);
  assert.match(await validatePoPdf(new Blob(["not a PDF"], { type: "application/pdf" })), /Choose a PDF/);
  assert.match(await validatePoPdf(new Blob([])), /empty/);
  assert.match(await validatePoPdf({ size: MAX_PO_PDF_BYTES + 1 }), /25 MB/);
});
await check("imported PO text cannot break the inline response header", () => {
  assert.equal(poPdfFilename('123"\r\nX-Header: bad'), "PO 123___X-Header_ bad.pdf");
  assert.equal(poPdfFilename("624679775"), "PO 624679775.pdf");
});
await check("replacement verifies upload, moves row, then removes the old file", async () => {
  const db = database();
  assert.deepEqual(await attachPoFile(db.client, company, input), { saved: true });
  assert.deepEqual(db.events, ["read", "list", "update", "remove"]);
  assert.equal(db.row.storage_path, path);
});
await check("first attachment guards the null path and removes nothing", async () => {
  const db = database({ row: { storage_path: null } });
  assert.deepEqual(await attachPoFile(db.client, company, { ...input, expectedStoragePath: null }), { saved: true });
  assert.deepEqual(db.events, ["read", "list", "update"]);
});
for (const [label, change] of [
  ["a different company's folder", { storagePath: path.replace(company, job) }],
  ["a different job's folder", { storagePath: path.replace(`/${job}/`, `/${company}/`) }],
  ["another PO's upload", { storagePath: path.replace(`/${po}-`, `/${job}-`) }],
  ["a nested traversal path", { storagePath: `${folder}/${po}-../${upload}.pdf` }],
  ["an outdated screen", { expectedStoragePath: null }],
  ["an oversized upload", { fileSize: MAX_PO_PDF_BYTES + 1 }],
]) {
  await check(`refuses ${label} without changing or removing a file`, async () => {
    const db = database();
    assert.ok((await attachPoFile(db.client, company, { ...input, ...change })).error);
    assert.equal(db.row.storage_path, old);
    assert.ok(!db.events.includes("update") && !db.events.includes("remove"));
  });
}
for (const options of [{ missing: true }, { metadata: { size: 19 } }, { metadata: { mimetype: "image/png" } }]) {
  await check(`refuses incomplete/wrong uploads: ${JSON.stringify(options)}`, async () => {
    const db = database(options);
    assert.ok((await attachPoFile(db.client, company, input)).error);
    assert.equal(db.row.storage_path, old);
    assert.deepEqual(db.events, ["read", "list"]);
  });
}
await check("a company mismatch cannot read or replace a PO", async () => {
  const db = database({ row: { company_id: job } });
  assert.ok((await attachPoFile(db.client, company, input)).error);
  assert.deepEqual(db.events, ["read"]);
});
for (const options of [{ race: true }, { writeError: true }]) {
  await check(`a concurrent change/write failure never deletes a file: ${JSON.stringify(options)}`, async () => {
    const db = database(options);
    assert.ok((await attachPoFile(db.client, company, input)).error);
    assert.ok(!db.events.includes("remove"));
  });
}
await check("cleanup failure does not report a successful attachment as failed", async () => {
  const db = database({ deleteError: true });
  assert.deepEqual(await attachPoFile(db.client, company, input), { saved: true });
  assert.equal(db.row.storage_path, path);
});
console.log(`All ${count} PO file checks passed.`);
