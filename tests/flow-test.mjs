// Source -> server -> TV, end to end on the local stand-in for Vercel:
// publish what the reader produced, read it back from the feed, and open the TV pages
// in Chromium at a fixed plant time.
// Run: node tests/flow-test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { start, db } from "./server.mjs";
import { readCellWorkbook } from "../js/reader.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const mod = { exports: {} };
new Function("module", "exports", readFileSync(here + "../vendor/xlsx.js", "utf8"))(mod, mod.exports);
const XLSX = mod.exports;

// TK1 workbook, week of 11/9/2026, Monday 1st shift (no standards file: values from the sheet)
const aoa = Array.from({ length: 64 }, () => []);
aoa[0] = ["11/09/2026", "LRC2", "TK#1", "", "MfgSys"];
aoa[3][1] = 1; aoa[3][2] = 10.5; aoa[3][3] = 20;
aoa[5] = [1002767, 500, 80, 1, 240];
aoa[20] = ["<b>9999</b>", null, 0, 0, 3];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "11-9-26");
const cell = readCellWorkbook(XLSX, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), "TK1 Weekly Production.xlsx", null, ["2026-11-09"]);

const server = await start(0);
const base = "http://localhost:" + server.address().port;
try {
  let r = await fetch(base + "/api/feed-snapshot");
  assert.equal(r.status, 404, "nothing published yet");
  r = await fetch(base + "/api/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: { cells: { TK1: cell } }, sourceLabel: "test" }) });
  assert.equal(r.status, 200);
  const first = await r.json();
  assert.equal(first.changed, true);
  r = await fetch(base + "/api/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: { cells: { TK1: cell } } }) });
  assert.equal((await r.json()).changed, false, "same numbers again is only a heartbeat");
  r = await fetch(base + "/api/feed-snapshot");
  const feed = await r.json();
  assert.equal(feed.data.cells.TK1.weeks["2026-11-09"]["0-1st"].parts[0].actual, 240);

  process.env.PUBLISH_KEY = "k1";
  r = await fetch(base + "/api/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: { cells: {} } }) });
  assert.equal(r.status, 401, "publish key enforced when set");
  delete process.env.PUBLISH_KEY;

  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Monday 11/9/2026 11:15 AM Eastern: 50% into the 1st shift.
    await page.clock.install({ time: new Date("2026-11-09T16:15:00Z") });
    await page.goto(base + "/tv/TK1");
    await page.waitForSelector(".cleft");
    const txt = await page.textContent(".screen");
    assert.match(txt, /TK1/);
    assert.match(txt, /1002767/);
    assert.match(txt, /NO STD/, "part without standard flagged");
    assert.ok(txt.includes("<b>9999</b>"), "workbook text is shown as text, not HTML");
    // 240 pcs at 80/hr with 1 operator = 3.0 earned h in 5.25 paid h -> 57%
    assert.match(await page.textContent(".ring"), /57%/);
    await page.goto(base + "/tv");
    await page.waitForSelector(".tile");
    assert.equal(await page.locator(".tile").count(), 14, "13 cells + legend");
    assert.match(await page.textContent(".kpis"), /NO STANDARD/);
    await page.goto(base + "/preview");
    await page.waitForSelector(".chip-sample");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
console.log("flow-test: ok");
