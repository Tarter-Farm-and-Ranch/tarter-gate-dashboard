// Tarter Portal path: the portal serves the page from this repo with a _feed/ folder next
// to it (manifest + each workbook as JSON) and may build _feed/snapshot.json by running
// snapshot.json's scripts. Covers the snapshot build in a bare engine (no fetch, no Intl),
// and the page reading either the summary or the workbooks, under a sub-path.
// Run: node tests/portal-test.mjs
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { start } from "./server.mjs";
import { root, loadXlsx, feedJson, weekSheet, STD_HEAD } from "./load.mjs";

const XLSX = loadXlsx();
const buf = (wb) => XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

// --- workbooks: standards, TK1 (with a part that has no standard), E-Coat
const std = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(std, XLSX.utils.aoa_to_sheet([
  STD_HEAD,
  ["TGC", 1002767, "LRC2", "Panel 1, Panel 5x6 Frame Weldment", "A", null, "", "", "", "", "", 10, "MfgSys", 10, 1, 0, "", 80],
  ["TGC", "1001353", "PAINTPL2", "4' economy gate e-coat blue", "C", null, "", "", "", "", "", 10, "MfgSys", 10, 13, 0, "", 422]
]), "Sheet1");
const tk1 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(tk1, weekSheet(XLSX, [new Date(Date.UTC(2026, 10, 9)), "LRC2", "TK#1", "", "MfgSys"], [
  { top: 1, k: 0, ops: 1, hours: 10.5, downtime: 20, parts: [[1002767, 500, 240]], extra: [["Z3815", 4]] }
]), "11-9-26");
const ecoat = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(ecoat, weekSheet(XLSX, ["11/09/2026", "PAINTPL2", "E-Coat", "", "MfgSys"], [
  { top: 1, k: 0, ops: 13, hours: 10.5, downtime: 0, parts: [["1001353", 2000, 1100]] }
]), "11-9-26");

const feed = fs.mkdtempSync(path.join(os.tmpdir(), "gate-feed-"));
fs.mkdirSync(path.join(feed, "files"));
const entries = [
  ["Production Reporting/Production Standards.xlsx", "std.json", std],
  ["Production Reporting/TK1 Weekly Production.xlsx", "tk1.json", tk1],
  ["Production Reporting/E-Coat Weekly Production.xlsx", "ecoat.json", ecoat],
  ["Production Reporting/~$TK1 Weekly Production.xlsx", "lock.json", tk1]
];
for (const [, name, wb] of entries) fs.writeFileSync(path.join(feed, "files", name), feedJson(XLSX, buf(wb)));
const manifest = {
  v: 1, status: "ok", problem: "", timeZone: "America/New_York",
  checkedAt: "2026-11-09T16:14:00Z", serverTime: "2026-11-09T16:15:00Z",
  files: entries.map(([p, name], i) => ({ path: p, modified: "2026-11-09T16:0" + i + ":00Z", size: 1000, etag: "e" + i, url: "files/" + name + "?etag=e" + i, sheetNames: ["x"], sheetsTotal: 1 }))
};
const writeManifest = (m) => fs.writeFileSync(path.join(feed, "manifest.json"), JSON.stringify(m));
writeManifest(manifest);

// --- the snapshot, built the way the portal does: snapshot.json's scripts in a bare engine
const spec = JSON.parse(fs.readFileSync(root + "snapshot.json", "utf8"));
function engine(readFeedFile) {
  const ctx = vm.createContext({ __readFeedFile: readFeedFile, __log: () => {} });
  vm.runInContext("delete globalThis.Intl;", ctx);
  for (const s of spec.scripts) vm.runInContext(fs.readFileSync(root + s, "utf8"), ctx, { filename: s });
  return ctx;
}
const readFeed = (url) => fs.readFileSync(path.join(feed, url.split("?")[0]), "utf8");
const snapText = await engine(readFeed)[spec.entry](JSON.stringify(manifest), null);
const snap = JSON.parse(snapText);
assert.deepEqual(Object.keys(snap.data.cells).sort(), ["E-Coat", "TK1"], "lock file skipped");
assert.equal(snap.data.cells.TK1.weeks["2026-11-09"]["0-1st"].parts[0].std, 80, "standard from the export");
assert.equal(snap.data.cells.TK1.weeks["2026-11-09"]["0-1st"].parts[0].desc, "Panel 1, Panel 5x6 Frame Weldment");
assert.equal(snap.data.missingStandards, false);
assert.ok(snapText.length < 20000, "TVs get a small summary");
// The workbooks can't be read: the last good summary stays, with the reason.
const kept = JSON.parse(await engine(() => { throw new Error("SharePoint timeout"); })[spec.entry](JSON.stringify(manifest), snapText));
assert.equal(kept.data.cells.TK1.weeks["2026-11-09"]["0-1st"].parts[0].actual, 240);
assert.match(kept.sourceError, /SharePoint timeout/);

// --- the page inside the portal (served under /d/gate/, feed next to it)
fs.writeFileSync(path.join(feed, "parent.html"), `<!doctype html><script>window.msgs=[];addEventListener("message",e=>msgs.push(e.data))</script><iframe src="../index.html?cell=TK1" style="width:1920px;height:1080px"></iframe>`);
const server = await start(0, { portal: feed });
const base = "http://localhost:" + server.address().port + "/d/gate/";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [], requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await page.clock.install({ time: new Date("2026-11-09T16:15:00Z") });

  // 1. No summary in the manifest: the page reads the workbooks itself.
  await page.goto(base);
  await page.waitForSelector(".tiles .card");
  assert.equal(await page.locator("#bar").isHidden(), true, "no source PC controls in the portal");
  const tk1Card = page.locator(".tiles .card", { hasText: "TK1" });
  assert.match(await tk1Card.textContent(), /57%/, "240 pcs at 80/hr, 1 operator, 5.25 h -> 57%");
  assert.match(await tk1Card.textContent(), /NO STANDARD/);
  assert.equal(await page.locator(".tiles .card", { hasText: "E-Coat" }).count(), 0, "E-Coat isn't on the plant screen yet");
  assert.ok(requests.some((p) => p.endsWith("/_feed/files/tk1.json")));
  assert.ok(!requests.some((p) => p.endsWith("/lock.json")), "lock file never downloaded");

  // 2. With the summary: only manifest + snapshot, no workbooks.
  fs.writeFileSync(path.join(feed, "snapshot.json"), snapText);
  writeManifest(Object.assign({}, manifest, { snapshot: { url: "snapshot.json?etag=s1" } }));
  requests.length = 0;
  await page.goto(base + "?cell=TK1");
  await page.waitForSelector(".cleft");
  assert.match(await page.textContent(".bigring"), /57%/);
  assert.match(await page.textContent(".parts"), /Panel 1, Panel 5x6 Frame Weldment/);
  assert.ok(requests.some((p) => p.endsWith("/_feed/snapshot.json")));
  assert.ok(!requests.some((p) => p.includes("/_feed/files/")), "TVs don't download the workbooks");

  // 3. The portal can't read SharePoint: same numbers, with a banner.
  writeManifest(Object.assign({}, manifest, { snapshot: { url: "snapshot.json?etag=s1" }, status: "failing", problem: "Access denied" }));
  await page.goto(base);
  await page.waitForSelector(".alert");
  assert.match(await page.textContent(".alert"), /CAN'T READ THE EXCEL FILES: Access denied/);

  // 4. In the portal's TV frame: the status line goes to the parent.
  writeManifest(Object.assign({}, manifest, { snapshot: { url: "snapshot.json?etag=s1" } }));
  await page.goto(base + "_feed/parent.html");
  await page.waitForFunction(() => window.msgs.length > 0);
  assert.match((await page.evaluate(() => window.msgs))[0].tvUpdated, /^Updated 11:14 AM$/);
  assert.match(await page.frames()[1].textContent(".bigring"), /57%/, "?cell= works inside the frame");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(feed, { recursive: true, force: true });
}
console.log("portal-test: ok");
