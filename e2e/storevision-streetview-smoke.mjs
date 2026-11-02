import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreVisionStreetView } from "../components/stores/storevision-streetview.tsx";
import assert from "node:assert/strict";
import { parseViewpoints, streetViewFor } from "../lib/stores/storevision-streetview.ts";
// Synthetic coordinates exercise validation, not a verified store frontage.
const view = { directoryId: "lidl-gb", code: "0034", latitude: 51.5, longitude: -0.1, heading: 90, pitch: 0, fov: 75, reviewedOn: "2026-11-02" };
const env = { VERCEL_ENV: "preview", STOREVISION_ENABLED: "true", GOOGLE_MAPS_EMBED_BROWSER_KEY: "test-only-not-a-key" };
for (const patch of [{ VERCEL_ENV: "production" }, { VERCEL_ENV: undefined }, { STOREVISION_ENABLED: "false" }, { GOOGLE_MAPS_EMBED_BROWSER_KEY: "" }]) assert.equal(streetViewFor([view], "lidl-gb", "34", {...env,...patch}), null);
assert.equal(streetViewFor([view], "other-client", "34", env), null);
assert.equal(streetViewFor([view], "lidl-gb", "35", env), null);
assert.deepEqual(parseViewpoints([view, {...view,code:"34"}]), []);
assert.deepEqual(parseViewpoints(Array.from({length:21},(_,i)=>({...view,code:String(i)}))), []);
for (const patch of [{latitude:NaN},{longitude:999},{heading:361},{pitch:91},{fov:0},{code:"x"}]) assert.deepEqual(parseViewpoints([{...view,...patch}]), []);
const urls=streetViewFor([view], "lidl-gb", "34", env);
assert.ok(urls);
const embed=new URL(urls.embedUrl);
assert.equal(embed.origin,"https://www.google.com");
assert.equal(embed.pathname,"/maps/embed/v1/streetview");
assert.equal(embed.searchParams.get("location"),"51.5,-0.1");
assert.equal(embed.searchParams.get("heading"),"90");
assert.equal(new URL(urls.mapsUrl).searchParams.has("key"),false);
console.log("Street View gating, pilot limits, validation and URL checks passed");

const html=renderToStaticMarkup(createElement(StoreVisionStreetView,{storeName:"Test site",...urls}));
assert.ok(html.includes("Show Street View"));
assert.ok(!html.includes("<iframe"));
assert.ok(!html.includes("test-only-not-a-key"));
console.log("Initial render contains no Google iframe or browser key");
