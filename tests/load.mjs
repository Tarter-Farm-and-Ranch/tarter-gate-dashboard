// Loads the page's plain scripts (js/*.js share one global object, Gate) into this Node
// process, the way index.html and the portal's snapshot engine load them, plus SheetJS
// for building test workbooks.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export function loadScripts(files) {
  for (const f of files) vm.runInThisContext(readFileSync(root + f, "utf8"), { filename: f });
  return globalThis.Gate;
}
export function loadXlsx() {
  const mod = { exports: {} };
  new Function("module", "exports", readFileSync(root + "vendor/xlsx.js", "utf8"))(mod, mod.exports);
  return mod.exports;
}
/** A workbook as the Tarter Portal feed serves it: SheetJS JSON, dates as local strings. */
export function feedJson(XLSX, buf) {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellFormula: true });
  for (const ws of Object.values(wb.Sheets)) {
    for (const [k, c] of Object.entries(ws)) {
      if (k[0] !== "!" && c.t === "d" && c.v instanceof Date) c.v = c.v.toISOString().slice(0, 19);
    }
  }
  return JSON.stringify({ v: 1, SheetNames: wb.SheetNames, Sheets: wb.Sheets });
}
/** Sheet like the weekly templates: `top` is the 0-based title row of a block (row 2 -> 1, row 35 -> 34). */
export function weekSheet(XLSX, header, blocks) {
  const aoa = Array.from({ length: 64 }, () => []);
  aoa[0] = header;
  for (const { top, k, ops, hours, downtime, parts, extra } of blocks) {
    const c = 8 * k;
    aoa[top + 2][c + 1] = ops; aoa[top + 2][c + 2] = hours; aoa[top + 2][c + 3] = downtime;
    (parts || []).forEach(([p, f, a], i) => { aoa[top + 4 + i][c] = p; aoa[top + 4 + i][c + 1] = f; aoa[top + 4 + i][c + 4] = a; });
    (extra || []).forEach(([p, a], i) => { aoa[top + 19 + i][c] = p; aoa[top + 19 + i][c + 4] = a; });
  }
  return XLSX.utils.aoa_to_sheet(aoa);
}
export const STD_HEAD = ["Company", "Part", "ResourceGrpID", "Description", "Rev", "Alternate Method", "Class", "Part Class", "Group", "Product Group", "Operation", "Opr", "Site", "OpDtlSeq", "Prod Crew Size", "Setup Crew Size", "OpDtlDesc", "Prod. Std"];
