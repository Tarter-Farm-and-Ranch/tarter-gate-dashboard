// Reader + metrics against workbooks built in the same layout as the real ones.
// Run: node tests/core-test.mjs
import assert from "node:assert/strict";
import { loadScripts, loadXlsx, weekSheet, feedJson, STD_HEAD } from "./load.mjs";

const G = loadScripts(["js/config.js", "js/reader.js", "js/metrics.js"]);
const XLSX = loadXlsx();
const open = (wb) => XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });

// --- Production Standards: main vs alternate routing, other plants, text vs number parts
const stdRows = [
  STD_HEAD,
  ["TGC", 1002767, "LRC1", "Panel 1", "A", null, "", "", "", "", "", 10, "MfgSys", 10, 2, 0, "", 50.75],
  ["TGC", 1002767, "LRC2", "Panel 1", "A", "A1", "", "", "", "", "", 10, "MfgSys", 10, 1, 0, "", 80],
  ["TGC", "1001353", "PAINTPL2", "4' gate e-coat", "C", null, "", "", "", "", "", 10, "MfgSys", 10, 13, 0, "", 422],
  ["TGC", "1001353", "PAINTPL2", "4' gate e-coat", "C", "C-1", "", "", "", "", "", 10, "MfgSys", 10, 13, 0, "", 422],
  ["TGC", "1001273", "ASSYPL2", "Bextra section", "A", null, "", "", "", "", "", 10, "TIC", 10, 3, 0, "", 99],
  ["TGC", "1001273", "ASSYPL2", "Bextra section", "A", null, "", "", "", "", "", 10, "MfgSys", 10, 10, 0, "", 30]
];
const stdWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(stdWb, XLSX.utils.aoa_to_sheet(stdRows), "Sheet1");
const std = G.readStandards(open(stdWb));
assert.equal(std.lookup("1002767", "LRC1", "MfgSys").std, 50.75);
assert.equal(std.lookup(1002767, "LRC2", "mfgsys").std, 80, "alternate used when it's the only one; site case-insensitive");
assert.equal(std.lookup("1001353", "PAINTPL2", "MfgSys").std, 422, "duplicate routing rows are not added up");
assert.equal(std.lookup("1001273", "ASSYPL2", "MfgSys").crew, 10, "other plant's row ignored");
assert.equal(std.lookup("999", "LRC1", "MfgSys"), null);
const fromFeed = G.readStandards(JSON.parse(feedJson(XLSX, XLSX.write(stdWb, { type: "buffer", bookType: "xlsx" }))));
assert.equal(fromFeed.lookup("1002767", "LRC1", "MfgSys").std, 50.75, "the portal's JSON workbook reads the same");
const noRef = open(stdWb);
delete noRef.Sheets.Sheet1["!ref"];
assert.equal(G.readStandards(noRef).size, std.size, "a sheet without !ref still reads");

// --- A weekly workbook laid out like the templates (block of 8 columns per day)
assert.equal(G.tabMonday("11-9-26"), "2026-11-09");
assert.equal(G.tabMonday("11-10-26"), null, "only Mondays name a week");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, weekSheet(XLSX, ["11/09/2026", "LRC2", "TK#1", "", "MfgSys"], [
  { top: 1, k: 0, ops: 1, hours: 10.5, downtime: 25, parts: [[1002767, 500, 480]], extra: [["NOPE", 5]] },
  { top: 34, k: 0, ops: 1, hours: 9.5, downtime: 0, parts: [[1002767, 400, 300]] }
]), "11-9-26");
const ws = wb.Sheets["11-9-26"];
ws.A7 = { t: "n", v: 1002760 }; ws.E7 = { t: "s", v: " waiting on material " }; // text in ACTUAL of the second part
ws.C8 = { t: "e", v: 42, w: "#N/A" }; ws.A8 = { t: "s", v: "ERRPART" }; // a #N/A standard in the sheet must not read as 42
const cell = G.readCellWorkbook(open(wb), "Weld/TK1 Weekly Production.xlsx", std, ["2026-11-09"]);
assert.equal(cell.cell, "TK1");
assert.equal(cell.rg, "LRC2");
const mon1 = cell.weeks["2026-11-09"]["0-1st"];
const mon2 = cell.weeks["2026-11-09"]["0-2nd"];
assert.equal(mon1.parts[0].std, 80);
assert.equal(mon1.parts[3].sched, false);
assert.equal(mon2.parts[0].actual, 300);
assert.equal(mon1.parts.length, 4, "a part with only a comment is still read");
assert.equal(mon1.parts[1].comment, "waiting on material", "text in ACTUAL is a comment");
assert.equal(mon1.parts[1].actual, null);
const noStdFile = G.readCellWorkbook(open(wb), "TK1 Weekly Production.xlsx", null, ["2026-11-09"]);
assert.equal(noStdFile.weeks["2026-11-09"]["0-1st"].parts[2].std, 0, "error cells read as empty");

// --- Metrics: earned hours / paid hours; a part without standard is flagged, not counted
const m = G.blockMetrics(mon1, 1);
assert.equal(m.eff, Math.round((480 / 80) / 10.5 * 100));
assert.equal(m.goal, 80);
assert.equal(m.adherence, 96);
assert.deepEqual(m.noStd, ["NOPE"]);
assert.equal(G.blockMetrics(mon1, 0.5).schedPace, 192, "schedule compared with what's expected by now");

// --- Shift clock (plant time)
const at = (iso, dayIndex, h, min = 0) => ({ iso, dayIndex, minutes: h * 60 + min });
let s = G.currentShift(at("2026-11-09", 0, 10, 42));
assert.equal(s.key, "0-1st"); assert.equal(s.running, true); assert.equal(s.minutesLeft, 348);
s = G.currentShift(at("2026-11-10", 1, 1, 0));
assert.equal(s.key, "0-2nd", "1 AM Tuesday is still Monday's 2nd shift"); assert.equal(s.dayISO, "2026-11-09");
s = G.currentShift(at("2026-11-14", 5, 1, 0));
assert.equal(s.key, "4-2nd", "1 AM Saturday is Friday's 2nd shift");
s = G.currentShift(at("2026-11-14", 5, 9, 0));
assert.equal(s.key, "5-wknd");
s = G.currentShift(at("2026-11-10", 1, 3, 0));
assert.equal(s.running, false); assert.equal(s.key, "0-2nd"); assert.equal(s.fraction, 1); assert.equal(s.minutesLeft, 0);
assert.equal(G.plantClock(new Date("2026-11-09T15:42:00Z")).minutes, 10 * 60 + 42, "plant clock in Eastern time");

// --- Which week tabs to read, without time zones
assert.deepEqual([...G.weeksToRead(Date.parse("2026-11-11T15:00:00Z"))], ["2026-11-09", "2026-11-02"]);
assert.deepEqual([...G.weeksToRead(Date.parse("2026-11-09T05:00:00Z"))], ["2026-11-09", "2026-11-02", "2026-10-26"], "Monday early: Sunday's week too");

// --- Whole view: Monday 10:42 AM Eastern, TK1 1st shift at 48% of the shift
const view = G.buildView({ cells: { TK1: cell } }, new Date("2026-11-09T15:42:00Z"));
const tk1 = view.tiles.find((t) => t.name === "TK1");
assert.equal(view.shift.key, "0-1st");
assert.ok(tk1.m.eff > 100, "480 pcs at 80/hr by 10:42 is ahead of pace");
assert.equal(view.tiles.find((t) => t.name === "K9").hasFile, false);
assert.equal(view.plant.noStd, 1);
assert.equal(view.plant.cellsWithData, 1);
assert.equal(view.plant.cellsShown, 2, "TK1 and TK2 on the plant screen (PLANT.showCells)");
assert.equal(view.tiles.find((t) => t.name === "K9").shown, false);
G.PLANT.showCells = [];
assert.equal(G.buildView({ cells: { TK1: cell } }, new Date("2026-11-09T15:42:00Z")).plant.cellsShown, 13, "[] shows every cell");
G.PLANT.showCells = ["TK1", "TK2"];

// --- A whole folder: standards + cells, copies skipped, unchanged files not read again
const book = (w) => XLSX.write(w, { type: "buffer", bookType: "xlsx" });
let loads = 0;
const file = (name, w, modified = 1) => ({ name, sig: name + ":" + modified, modified, load: () => { loads++; return open(w); } });
const files = [
  file("Production Standards.xlsx", stdWb),
  file("Weld/TK1 Weekly Production.xlsx", wb, 5),
  file("Weld/TK1 Weekly Production (1).xlsx", wb, 9),
  file("~$TK1 Weekly Production.xlsx", wb, 9)
];
const cache = {};
const now = Date.parse("2026-11-09T15:42:00Z");
let r = await G.collect(files, cache, now);
assert.deepEqual(Object.keys(r.data.cells), ["TK1"]);
assert.equal(r.data.cells.TK1.weeks["2026-11-09"]["0-1st"].parts[0].std, 80, "looked up in the standards export");
assert.equal(r.data.missingStandards, false);
assert.equal(loads, 2);
r = await G.collect(files, cache, now);
assert.equal(loads, 2, "nothing changed, nothing read");
r = await G.collect([files[1]], {}, now);
assert.equal(r.data.missingStandards, true);
assert.ok(r.warnings.some((w) => /Production Standards\.xlsx not found/.test(w)));
r = await G.collect([files[0], { name: "K9 Weekly Production.xlsx", sig: "x", modified: 1, load: () => { throw new Error("locked"); } }], {}, now);
assert.ok(r.warnings.some((w) => /^K9: can't read/.test(w)), "a locked file is reported, not fatal");
void book;

// --- Dashboard Settings.xlsx: which cells are on the all-cells screen
const setWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(setWb, XLSX.utils.aoa_to_sheet([
  ["Tarter Gate dashboard: set SHOW to YES when a cell starts entering data"],
  [],
  ["AREA", "CELL", "SHOW ON TV"],
  ["WELD", "TK1", "YES"], ["WELD", "tk2", "yes"], ["WELD", "K9", "NO"], ["FINISH", "E-Coat", "Y"], ["?", "Laser 9", "YES"], ["WELD", "AMI", ""]
]), "Cells");
setWb.Sheets.Cells.D3 = { t: "s", v: "EXPECTED OPERATORS" }; setWb.Sheets.Cells.D4 = { t: "n", v: 2 }; setWb.Sheets.Cells["!ref"] = "A1:D9";
XLSX.utils.book_append_sheet(setWb, XLSX.utils.aoa_to_sheet([["SAFETY"], ["Last recordable", 46157], ["Today's topic", "Ladder Safety"]]), "Safety");
const settings = G.readSettings(open(setWb));
function offWbPlaceholder() { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([["x"]]), "x"); return w; }
assert.deepEqual(settings.expected, { TK1: 2 }, "EXPECTED OPERATORS per cell");
assert.deepEqual(settings.safety, { lastRecordable: "2026-05-15", topic: "Ladder Safety" }, "Safety tab: date (Excel serial) and topic");
assert.deepEqual([...settings.showCells], ["TK1", "TK2", "E-Coat"], "YES / Y, any case; NO and blank are off");
assert.deepEqual([...settings.unknown], ["Laser 9"]);
r = await G.collect([files[0], files[1], file("Dashboard Settings.xlsx", setWb)], {}, now);
assert.deepEqual([...r.data.showCells], ["TK1", "TK2", "E-Coat"]);
assert.ok(r.warnings.some((w) => /"Laser 9" isn't a cell/.test(w)));
const v2 = G.buildView(r.data, new Date("2026-11-09T15:42:00Z"));
assert.equal(v2.plant.cellsShown, 3, "the settings file decides the screen");
assert.deepEqual(v2.shownAreas.map((a) => a.name), ["WELD", "FINISH"]);
r = await G.collect([files[1], file("Dashboard Settings 1.xlsx", setWb)], {}, now);
assert.deepEqual([...r.data.showCells], ["TK1", "TK2", "E-Coat"], "a download that became 'Dashboard Settings 1.xlsx' still counts");
r = await G.collect([files[1], file("Dashboard Settings (1).xlsx", setWb), file("~$Dashboard Settings.xlsx", offWbPlaceholder())], {}, now);
assert.deepEqual([...r.data.showCells], ["TK1", "TK2", "E-Coat"], "'(1)' copy counts, lock file doesn't");
r = await G.collect([files[1]], {}, now);
assert.equal(r.data.showCells, null, "no settings file: PLANT.showCells");
const offWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(offWb, XLSX.utils.aoa_to_sheet([["CELL", "SHOW"], ["TK1", "NO"]]), "Cells");
r = await G.collect([files[1], file("Dashboard Settings.xlsx", offWb)], {}, now);
assert.equal(r.data.showCells, null, "nothing set to YES: PLANT.showCells, with a warning");
assert.ok(r.warnings.some((w) => /no cell set to YES/.test(w)));

// --- the part being made now: the one whose ACTUAL went up since the last read
{
  const w2 = XLSX.utils.book_new();
  const mk = (a1, a2) => weekSheet(XLSX, ["11/09/2026", "LRC2", "TK#1", "", "MfgSys"], [{ top: 1, k: 0, ops: 1, hours: 10.5, downtime: 0, parts: [[1002767, 500, a1], [1002760, 200, a2]] }]);
  XLSX.utils.book_append_sheet(w2, mk(100, 50), "11-9-26");
  const c2 = {};
  const f1 = { name: "TK1 Weekly Production.xlsx", sig: "s1", modified: 1, load: () => open(w2) };
  let rr = await G.collect([f1], c2, now);
  assert.equal(rr.data.cells.TK1.weeks["2026-11-09"]["0-1st"].nowPart, undefined, "nothing to compare yet");
  const w3 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w3, mk(100, 80), "11-9-26");
  rr = await G.collect([{ name: f1.name, sig: "s2", modified: 2, load: () => open(w3) }], c2, now);
  assert.equal(rr.data.cells.TK1.weeks["2026-11-09"]["0-1st"].nowPart, "1002760", "the part that went up is running");
  rr = await G.collect([{ name: f1.name, sig: "s3", modified: 3, load: () => open(w3) }], c2, now);
  assert.equal(rr.data.cells.TK1.weeks["2026-11-09"]["0-1st"].nowPart, "1002760", "kept until another part goes up");
  const fresh = await G.collect([{ name: f1.name, sig: "s4", modified: 4, load: () => open(w2) }], {}, now, { TK1: { weeks: { "2026-11-09": { "0-1st": { parts: [{ part: "1002767", actual: 90 }, { part: "1002760", actual: 50 }], nowPart: "1002760" } } } } });
  assert.equal(fresh.data.cells.TK1.weeks["2026-11-09"]["0-1st"].nowPart, "1002767", "compared with the previous snapshot (portal)");
}

console.log("core-test: ok");
