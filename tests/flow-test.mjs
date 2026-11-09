// Vercel path, end to end on the local stand-in: publish what the reader produced, read it
// back from the feed, and open the TV pages in Chromium at a fixed plant time.
// Run: node tests/flow-test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { start } from "./server.mjs";
import { loadScripts, loadXlsx, weekSheet } from "./load.mjs";

const G = loadScripts(["js/config.js", "js/reader.js"]);
const XLSX = loadXlsx();

// TK1 workbook, week of 11/9/2026, Monday 1st shift (no standards file: values from the sheet)
const wb = XLSX.utils.book_new();
const ws = weekSheet(XLSX, ["11/09/2026", "LRC2", "TK#1", "", "MfgSys"], [{ top: 1, k: 0, ops: 1, hours: 10.5, downtime: 20, parts: [] }]);
XLSX.utils.sheet_add_aoa(ws, [[1002767, 500, 80, 1, 240]], { origin: "A6" });
XLSX.utils.sheet_add_aoa(ws, [["<b>9999</b>", null, 0, 0, 3]], { origin: "A21" });
XLSX.utils.book_append_sheet(wb, ws, "11-9-26");
const cell = G.readCellWorkbook(XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })), "TK1 Weekly Production.xlsx", null, ["2026-11-09"]);

const server = await start(0);
const base = "http://localhost:" + server.address().port;
const post = (body) => fetch(base + "/api/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
try {
  let r = await fetch(base + "/api/feed-snapshot");
  assert.equal(r.status, 404, "nothing published yet");
  r = await post({ data: { cells: { TK1: cell } }, sourceLabel: "test" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).changed, true);
  r = await post({ data: { cells: { TK1: cell } } });
  assert.equal((await r.json()).changed, false, "same numbers again is only a heartbeat");
  r = await fetch(base + "/api/feed-snapshot");
  assert.equal((await r.json()).data.cells.TK1.weeks["2026-11-09"]["0-1st"].parts[0].actual, 240);
  r = await post({ data: { cells: { TK1: cell }, showCells: ["TK1", "E-Coat"] } });
  r = await fetch(base + "/api/feed-snapshot");
  assert.deepEqual((await r.json()).data.showCells, ["TK1", "E-Coat"], "the settings file's cells reach the TVs");

  process.env.PUBLISH_KEY = "k1";
  r = await post({ data: { cells: {} } });
  assert.equal(r.status, 401, "publish key enforced when set");
  delete process.env.PUBLISH_KEY;

  r = await fetch(base + "/tv/TK1", { redirect: "manual" });
  assert.equal(r.headers.get("location"), "/?tv=1&cell=TK1", "old /tv links still work");

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
    assert.match(await page.textContent(".bigring"), /57%/);
    assert.match(await page.textContent("[data-clock]"), /^11:15:\d\d AM$/, "clock with seconds, plant time");
    await page.goto(base + "/?tv=1");
    await page.waitForSelector(".tiles .card");
    assert.equal(await page.locator(".tiles .card").count(), 2, "TK1 + E-Coat (Dashboard Settings)");
    assert.match(await page.textContent(".hdr"), /80%\+ on pace/, "one row: the color legend is in the header");
    assert.match(await page.textContent(".tiles"), /E-Coat/);
    assert.equal(await page.locator(".few").count(), 1, "big cards for a few cells");
    assert.equal(await page.locator(".tiles .card .c-saved").count(), 0, "no save time when the workbook didn't come with one");
    assert.match(await page.textContent(".tiles"), /PARTS · 1ST SHIFT[\s\S]*1002767/, "big cards list the parts, with the shift they belong to");
    assert.doesNotMatch(await page.textContent(".kpis"), /STANDARD/, "no standards tile at the top; the cards say it");
    assert.match(await page.textContent(".kpi-dark"), /5h 15m\s*SHIFT LEFT\s*1st shift\s*ends 4:30 PM/);
    assert.equal(await page.locator(".tarter-mark").count(), 1, "the real Tarter logo");
    await page.goto(base + "/preview");
    await page.waitForSelector(".chip-sample");
    assert.equal(await page.locator(".tiles .card").count(), 2);
    assert.match(await page.textContent(".tiles .card .c-saved"), /^SAVED \d{1,2}:\d\d [AP]M$/, "each card says when its workbook was saved");
    await page.goto(base + "/?preview=1&cell=AWL1");
    await page.waitForSelector(".cleft");
    assert.match(await page.textContent(".hdr"), /AWL1/, "a cell not on the plant screen still opens on its own");
    // A long list: 8 parts with a standard and 6 without. The card counts the ones without
    // and cuts the list; the cell screen caps its table.
    const many = JSON.parse(JSON.stringify(cell));
    const blk = many.weeks["2026-11-09"]["0-1st"];
    blk.parts = Array.from({ length: 14 }, (_, i) => ({ part: "P" + (100 + i), desc: "", forecast: 50, actual: 20, std: i < 8 ? 40 : 0, crew: i < 8 ? 1 : 0, sched: true }));
    await post({ data: { cells: { TK1: many }, showCells: ["TK1", "TK2"] } });
    await page.goto(base + "/?tv=1");
    await page.waitForSelector(".plist");
    assert.equal(await page.locator(".tiles .card").first().locator(".pl-row").count(), 4, "big card lists 4 parts");
    assert.match(await page.textContent(".plist"), /\+4 more parts/);
    assert.match(await page.textContent(".tiles .card"), /6 PARTS · NO STANDARD/, "parts without a standard are counted, not listed");
    const cardBox = await page.locator(".tiles .card").first().boundingBox();
    assert.ok(cardBox.y + cardBox.height <= 1080, "the card stays on the screen");
    await page.goto(base + "/?tv=1&cell=TK1");
    await page.waitForSelector(".prow");
    assert.equal(await page.locator(".prow").count(), 10, "cell screen table capped");
    assert.match(await page.textContent(".parts"), /\+4 more parts in the workbook/);
    assert.match(await page.textContent(".parts"), /6 PARTS WITH NO LRC2 STANDARD[\s\S]*and 2 more/);
    await page.goto(base + "/");
    await page.waitForSelector("#bar:not([hidden])");
    const bar = await page.locator("#bar").boundingBox();
    const scr = await page.locator(".screen").boundingBox();
    assert.ok(scr.y + scr.height <= bar.y + 1, "source PC: the bar is under the screen, not over it");
    assert.match(await page.textContent(".waiting"), /CONNECT THE PRODUCTION REPORTING FOLDER/, "source PC on Vercel");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
console.log("flow-test: ok");
