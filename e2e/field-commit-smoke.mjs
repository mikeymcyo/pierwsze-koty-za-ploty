// Exercise the capture HTTP handler and its actual report actions with a disposable data store.
// A blocked report-preparation request must have no effect on ingress or acknowledgement.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectId = "f11ca9e8-a70f-474e-8cb2-f259cbaf44ad";
const rows = new Map();
const companyId = "78d296f5-22a7-4bd3-a568-d7dafced50a6";
const session = {userId: "e8e60b8e-0816-4dce-9d52-d041efdb045e", companyId};
let counter = 0;
let loggedIn = true;

function from(table) {
  assert.equal(table, "reports");
  const filters = [];
  let insert, update;
  const q = {
    select() { return q; }, order() { return q; }, limit() { return q; },
    eq(key, value) { filters.push([key, value]); return q; },
    insert(value) { insert = value; return q; }, update(value) { update = value; return q; },
    async single() {
      assert.ok(insert);
      if (rows.has(insert.id)) return {error: {code: "23505"}};
      const data = {...insert, status: "draft", updated_at: String(++counter), raw_notes: null};
      rows.set(insert.id, data);
      return {data};
    },
    async maybeSingle() {
      const row = [...rows.values()].find(item => filters.every(([k,v]) => item[k] === v));
      if (row && update) Object.assign(row, update, {updated_at: String(++counter)});
      return {data: row ? {...row} : null};
    },
  };
  return q;
}
const cache = {
  "next/navigation": {redirect: () => {throw Error("Unexpected redirect");}},
  "next/cache": {revalidatePath() {}},
  "@/lib/auth/session": {getSessionContext: async () => loggedIn ? session : null, requireSessionContext: async () => session, displayName: () => "Fixture"},
  "@/lib/reports/carry-over": {copyPreviousEntries: async () => {}},
  "@/lib/supabase/server": {createClient: async () => ({from})},
  "@/app/(app)/reports/photo-actions": {attachPhoto: async () => {throw Error("Unexpected attachment");}},
};
function load(id) {
  if (id in cache) return cache[id];
  if (!id.startsWith("@/")) return require(id);
  const path = new URL("../"+id.slice(2)+".ts", import.meta.url);
  const js = ts.transpileModule(readFileSync(path,"utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const loaded = {exports:{}};
  new Function("module", "exports", "require", js)(loaded, loaded.exports, load);
  return cache[id] = loaded.exports;
}
const {POST} = load("@/app/api/capture/commit/route");
function post(body, origin = "https://fixture.invalid") {
  return POST(new Request("https://fixture.invalid/api/capture/commit", {method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(body)}));
}
const create = {kind:"report", projectId, day:"2026-11-09"};
assert.equal((await post(create, "https://other.invalid")).status, 403);
loggedIn = false;
assert.equal((await post(create)).status, 401);
loggedIn = true;
const reports = await Promise.all(Array.from({length:3}, async () => (await post(create)).json()));
assert.equal(rows.size, 1);
const {reportId} = reports[0];
assert.ok(reports.every(row => row.reportId === reportId));
assert.equal(rows.get(reportId).report_date, "2026-11-09");
const note = {kind:"note", reportId, at:"15:48",text:"Loading bay inspected."};
assert.deepEqual(await (await post(note)).json(), {savedAt:note.at});
await post({...note,at:"15:51",text:"Gate closed."});
assert.deepEqual(await (await post(note)).json(), {savedAt:note.at});
assert.equal(rows.get(reportId).raw_notes, "[15:48] Loading bay inspected.\n\n[15:51] Gate closed.");
rows.get(reportId).status = "final";
assert.equal((await post(note)).status, 409);
console.log("PASS capture HTTP: session, origin, concurrent report creation, original day, lost acknowledgement after another note, and issued report refusal");
