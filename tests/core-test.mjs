// Reader + metrics against workbooks built in the same layout as the real ones.
// Run: node tests/core-test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readStandards, readCellWorkbook, tabMonday } from "../js/reader.js";
import { currentShift, blockMetrics, buildView, plantClock } from "../js/metrics.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const mod = { exports: {} };
new Function("module", "exports", readFileSync(here + "../vendor/xlsx.js", "utf8"))(mod, mod.exports);
const XLSX = mod.exports;

function toBuffer(wb) {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// --- Production Standards: main vs alternate routing, other plants, text vs number parts
const stdRows = [
  ["Company", "Part", "ResourceGrpID", "Description", "Rev", "Alternate Method", "Class", "Part Class", "Group", "Product Group", "Operation", "Opr", "Site", "OpDtlSeq", "Prod Crew Size", "Setup Crew Size", "OpDtlDesc", "Prod. Std"],
  ["TGC", 1002767, "LRC1", "Panel 1", "A", null, "", "", "", "", "", 10, "MfgSys", 10, 2, 0, "", 50.75],
  ["TGC", 1002767, "LRC2", "Panel 1", "A", "A1", "", "", "", "", "", 10, "MfgSys", 10, 1, 0, "", 80],
  ["TGC", "1001353", "PAINTPL2", "4' gate e-coat", "C", null, "", "", "", "", "", 10, "MfgSys", 10, 13, 0, "", 422],
  ["TGC", "1001353", "PAINTPL2", "4' gate e-coat", "C", "C-1", "", "", "", "", "", 10, "MfgSys", 10, 13, 0, "", 422],
  ["TGC", "1001273", "ASSYPL2", "Bextra section", "A", null, "", "", "", "", "", 10, "TIC", 10, 3, 0, "", 99],
  ["TGC", "1001273", "ASSYPL2", "Bextra section", "A", null, "", "", "", "", "", 10, "MfgSys", 10, 10, 0, "", 30]
];
const stdWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(stdWb, XLSX.utils.aoa_to_sheet(stdRows), "Sheet1");
const std = readStandards(XLSX, toBuffer(stdWb));
assert.deepEqual(std.lookup("1002767", "LRC1", "MfgSys").std, 50.75);
assert.equal(std.lookup(1002767, "LRC2", "mfgsys").std, 80, "alternate used when it's the only one; site case-insensitive");
assert.equal(std.lookup("1001353", "PAINTPL2", "MfgSys").std, 422, "duplicate routing rows are not added up");
assert.equal(std.lookup("1001273", "ASSYPL2", "MfgSys").crew, 10, "other plant's row ignored");
assert.equal(std.lookup("999", "LRC1", "MfgSys"), null);

// --- A weekly workbook laid out like the templates (block of 8 columns per day).
// `top` is the 0-based index of the block's title row (row 2 -> 1, row 35 -> 34).
assert.equal(tabMonday("11-9-26"), "2026-11-09");
assert.equal(tabMonday("11-10-26"), null, "only Mondays name a week");
function sheetFor(blocks) {
  const aoa = Array.from({ length: 64 }, () => []);
  aoa[0][0] = "11/09/2026"; aoa[0][1] = "LRC2"; aoa[0][2] = "TK#1"; aoa[0][4] = "MfgSys";
  for (const { top, k, ops, hours, downtime, parts, extra } of blocks) {
    const c = 8 * k;
    aoa[top + 2][c + 1] = ops; aoa[top + 2][c + 2] = hours; aoa[top + 2][c + 3] = downtime;
    parts.forEach(([p, f, a], i) => { aoa[top + 4 + i][c] = p; aoa[top + 4 + i][c + 1] = f; aoa[top + 4 + i][c + 4] = a; });
    (extra || []).forEach(([p, a], i) => { aoa[top + 19 + i][c] = p; aoa[top + 19 + i][c + 4] = a; });
  }
  return XLSX.utils.aoa_to_sheet(aoa);
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheetFor([
  { top: 1, k: 0, ops: 1, hours: 10.5, downtime: 25, parts: [[1002767, 500, 480]], extra: [["NOPE", 5]] },
  { top: 34, k: 0, ops: 1, hours: 9.5, downtime: 0, parts: [[1002767, 400, 300]] }
]), "11-9-26");
const cell = readCellWorkbook(XLSX, toBuffer(wb), "TK1 Weekly Production.xlsx", std, ["2026-11-09"]);
assert.equal(cell.cell, "TK1");
assert.equal(cell.rg, "LRC2");
const mon1 = cell.weeks["2026-11-09"]["0-1st"];
const mon2 = cell.weeks["2026-11-09"]["0-2nd"];
assert.equal(mon1.parts.length, 2);
assert.equal(mon1.parts[0].std, 80);
assert.equal(mon1.parts[1].sched, false);
assert.equal(mon2.parts[0].actual, 300);

// --- Metrics: earned hours / paid hours; a part without standard is flagged, not counted
const m = blockMetrics(mon1, 1);
assert.equal(m.eff, Math.round((480 / 80) / 10.5 * 100));
assert.equal(m.goal, 80);
assert.equal(m.adherence, 96);
assert.deepEqual(m.noStd, ["NOPE"]);

// --- Shift clock (plant time)
const at = (iso, dayIndex, h, min = 0) => ({ iso, dayIndex, minutes: h * 60 + min });
let s = currentShift(at("2026-11-09", 0, 10, 42));
assert.equal(s.key, "0-1st"); assert.equal(s.running, true);
s = currentShift(at("2026-11-10", 1, 1, 0));
assert.equal(s.key, "0-2nd", "1 AM Tuesday is still Monday's 2nd shift"); assert.equal(s.dayISO, "2026-11-09");
s = currentShift(at("2026-11-14", 5, 1, 0));
assert.equal(s.key, "4-2nd", "1 AM Saturday is Friday's 2nd shift");
s = currentShift(at("2026-11-14", 5, 9, 0));
assert.equal(s.key, "5-wknd");
s = currentShift(at("2026-11-10", 1, 3, 0));
assert.equal(s.running, false); assert.equal(s.key, "0-2nd"); assert.equal(s.fraction, 1);
assert.equal(plantClock(new Date("2026-11-09T15:42:00Z")).minutes, 10 * 60 + 42, "plant clock in Eastern time");

// --- Whole view: Monday 10:42 AM Eastern, TK1 1st shift at 48% of the shift
const view = buildView({ cells: { TK1: cell } }, new Date("2026-11-09T15:42:00Z"));
const tk1 = view.tiles.find((t) => t.name === "TK1");
assert.equal(view.shift.key, "0-1st");
assert.ok(tk1.m.eff > 100, "480 pcs at 80/hr by 10:42 is ahead of pace");
assert.equal(view.tiles.find((t) => t.name === "K9").hasFile, false);
assert.equal(view.plant.noStd, 1);

console.log("core-test: ok");
