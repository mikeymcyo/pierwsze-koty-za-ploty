// Run from the repository root with node e2e/field-capture-browser.mjs.
// WebKit for Windows lacks media APIs. Simulate only those APIs and the remote services.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { webkit, chromium, devices } from "playwright";

const engine = process.env.FIELD_ENGINE || "webkit";
const chromiumRun = engine === "chromium";
const browser = await (chromiumRun ? chromium : webkit).launch(chromiumRun ? {
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH && {executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
} : {});
const modules = {};
for (const [id, path] of Object.entries({
  react: "react/cjs/react.production.js", scheduler: "scheduler/cjs/scheduler.production.js",
  "react-dom": "react-dom/cjs/react-dom.production.js", "react-dom/client": "react-dom/cjs/react-dom-client.production.js",
  "react/jsx-runtime": "react/cjs/react-jsx-runtime.production.js",
})) modules[id] = readFileSync(resolve("node_modules", path), "utf8");
for (const file of ["lib/field-commit.ts", "lib/field-voice.ts", "lib/field-photo.ts", "lib/field-outbox.ts",
  "lib/photos.ts", "lib/photo-captions.ts", "lib/photo-quality.ts", "lib/reports/working-day.ts",
  "lib/reports/prepare-with-pending.ts", "components/reports/field-capture.tsx"]) {
  modules["@/" + file.replace(/\.tsx?$/, "")] = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022},
  }).outputText;
}
try {
  const context = await browser.newContext({...devices["iPhone 13"], ...(chromiumRun && {permissions:["camera","microphone"]})});
  const attempts = [], commits = [], audioSizes = [], pages = [];
  let failStorage = true, failNote = true;
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    assert.equal(url.origin, "https://field.invalid");
    if (url.pathname === "/") return route.fulfill({contentType:"text/html",body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});
    if (url.pathname === "/api/capture/transcribe") {
      if (chromiumRun) assert.ok(req.postDataBuffer()?.length);
      return route.fulfill({json:{text:"Fixture voice note."}});
    }
    if (url.pathname === "/api/capture/commit") {
      const body = req.postDataJSON();
      commits.push(body);
      if (body.kind === "note" && failNote) return route.fulfill({status:503,json:{error:"Note acknowledgement interrupted"}});
      const json = {report:{reportId:"report-fixture"},photo:{ok:true},note:{savedAt:"12:34"}}[body.kind];
      assert.ok(json);
      return route.fulfill({json});
    }
    throw Error("Unexpected request " + req.url());
  });
  await context.exposeBinding("writePhoto", async (_source, path, size) => {
    if (path.includes(".thumb.")) return {error:null};
    attempts.push({path,size});
    return {error:failStorage ? {message:"Upload signal lost"} : null};
  });
  await context.exposeBinding("measureAudio", (_source, size) => { audioSizes.push(size); });
  await context.addInitScript(({mock}) => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (input === "/api/capture/transcribe") await window.measureAudio(init.body.size);
      return fetchOriginal(input, init);
    };
    Object.defineProperty(navigator, "standalone", {value:true});
    window.mediaRequests = [];
    if (!mock) {
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = opts => {window.mediaRequests.push(opts);return get(opts);};
      return;
    }
    Object.defineProperty(navigator, "mediaDevices", {value:{getUserMedia: async opts => {
      window.mediaRequests.push(opts);
      return {getTracks:()=>[{stop(){}}]};
    }}});
    Object.defineProperties(HTMLVideoElement.prototype, {
      videoWidth:{get:()=>160},videoHeight:{get:()=>120},srcObject:{get(){return this.fixtureStream;},set(v){this.fixtureStream=v;}},
      play:{value:async function() {this.dispatchEvent(new Event("playing"));}},
      requestVideoFrameCallback:{value:fn=>requestAnimationFrame(fn)},
    });
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source,...args) {
      if (!(source instanceof HTMLVideoElement)) return drawImage.call(this,source,...args);
      this.fillStyle = "green"; this.fillRect(0,0,160,120);
    };
    window.MediaRecorder = class {
      static isTypeSupported(type) {return type === "audio/mp4";}
      constructor() {this.mimeType="audio/mp4";this.state="inactive";}
      start() {this.state="recording";}
      stop() {this.state="inactive"; queueMicrotask(()=>{this.ondataavailable({data:new Blob(["fixture-voice"],{type:this.mimeType})});this.onstop();});}
    };
  }, {mock:!chromiumRun});
  async function open(userId="owner") {
    const p = await context.newPage();
    p.setDefaultTimeout(12000);
    p.on("pageerror",e=>pages.push(e.message));
    await p.goto("https://field.invalid/");
    await p.evaluate(({modules,userId})=>{
      const cache = {"lucide-react": {Camera:()=>null,Mic:()=>null,ArrowUpRight:()=>null,X:()=>null,Check:()=>null},
        "@/lib/supabase/client": {createClient:()=>({storage:{from:()=>({upload:(path,blob)=>window.writePhoto(path,blob.size)})}})},
        "@/app/(app)/reports/photo-actions":{}, "@/app/(app)/summary-reports/photo-actions":{}};
      function load(id) {
        if (Object.hasOwn(cache,id)) return cache[id];
        if (!modules[id]) throw Error("Missing browser module "+id);
        const m={exports:{}};
        new Function("module","exports","require",modules[id])(m,m.exports,load);
        return cache[id]=m.exports;
      }
      window.drafts=()=>load("@/lib/field-outbox").listFieldDrafts(userId+":company");
      window.original=async id=>(await load("@/lib/field-outbox").readFieldMedia(id)).size;
      const node=load("react").createElement(load("@/components/reports/field-capture").FieldCapture,
        {userId,companyId:"company",projectId:"project",projectName:"Fixture",dashboard:true});
      load("react-dom/client").createRoot(document.getElementById("root")).render(node);
    },{modules,userId});
    await p.getByRole("button",{name:/^Capture/}).waitFor();
    return p;
  }
  let p=await open();
  const times=[];
  for(let i=0;i<5;i++) {
    await p.getByRole("button",{name:/^Capture/}).tap();
    await p.waitForFunction(()=>performance.getEntriesByName("siteboss:camera-open").length>0);
    const ms=await p.evaluate(()=>performance.getEntriesByName("siteboss:camera-open").at(-1).duration);
    times.push(ms);
    if(i<4) {
      await p.getByRole("button",{name:"Close camera"}).tap();
      await p.evaluate(()=>performance.clearMeasures("siteboss:camera-open"));
    }
  }
  assert.deepEqual(commits,[]);
  assert.ok(times.every(t=>t<2000), "fixture took over two seconds");
  await p.getByRole("button",{name:"Take photo and start voice note"}).tap();
  await p.getByText(/Recording voice note/).waitFor();
  if (chromiumRun) await p.waitForTimeout(1250);
  assert.equal(commits.length,0);
  await p.getByRole("button",{name:"Save capture"}).tap();
  await p.getByText("Upload signal lost").waitFor();
  const saved=await p.evaluate(async()=>{const [row]=await window.drafts();return {row,photo:await window.original(row.photos[0]),audio:await window.original(row.id)};});
  assert.ok(saved.photo>0 && saved.audio>0);
  assert.equal(saved.row.photos.length,1);
  assert.ok(saved.row.hasAudio);
  assert.equal(attempts.length,1);
  assert.ok((await p.evaluate(()=>window.mediaRequests)).some(x=>x.audio===true));
  await p.close();
  p=await open("another-owner");
  assert.deepEqual(await p.evaluate(()=>window.drafts()),[]);
  assert.equal(await p.getByRole("button",{name:"Retry upload"}).count(),0);
  await p.close();
  p=await open();
  await p.getByRole("button",{name:"Retry upload"}).waitFor();
  assert.deepEqual(await p.evaluate(async({row})=>[await window.original(row.photos[0]),await window.original(row.id)],saved),[saved.photo,saved.audio]);
  failStorage=false;
  await p.getByRole("button",{name:"Retry upload"}).tap();
  await p.getByText("Note acknowledgement interrupted").waitFor();
  assert.equal(attempts[1].path,attempts[0].path);
  assert.equal(audioSizes[0],saved.audio);
  assert.equal((await p.evaluate(()=>window.drafts()))[0].attached.length,1);
  await p.close();
  p=await open();failNote=false;
  await p.getByRole("button",{name:"Retry upload"}).tap();
  await p.getByText(/Capture saved to Fixture/).waitFor();
  assert.deepEqual(await p.evaluate(()=>window.drafts()),[]);
  assert.deepEqual(commits.map(x=>x.kind),["report","photo","note","note"]);
  assert.equal(commits.at(-1).text,"Fixture voice note.");
  assert.equal(attempts.length,2); assert.equal(audioSizes.length,1); assert.deepEqual(pages,[]);
  console.log(JSON.stringify({engine,simulatedMedia:!chromiumRun,tapToFrameMs:times,photoBytes:saved.photo,audioBytes:saved.audio,
    verified:"three taps; upload failure; preserved originals across two reopens; owner isolation; checkpointed retry without duplicate attachment"},null,2));
} finally {await browser.close();}
