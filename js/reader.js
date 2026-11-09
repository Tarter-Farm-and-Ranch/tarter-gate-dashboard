// Reads the weekly production workbooks and the Production Standards export.
// Pure functions: they take the SheetJS library and file contents, so the same code runs
// on the source PC (browser) and in the tests (Node).

import { PLANT, LAYOUT, blockPosition } from "./config.js";

const norm = (v) => (v === null || v === undefined ? "" : String(v).trim());
const key = (part, rg, site) => [norm(part), norm(rg), norm(site)].join("|").toLowerCase();

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Production Standards export (Epicor): one row per part + operation + resource group.
 * Columns are found by header so a re-export with columns moved still works.
 * The export repeats operations once per alternate routing (column "Alternate Method"):
 * the main routing wins, an alternate is used only when the part has nothing else in
 * that resource group, and copies are never added up (same rule as the workbooks).
 */
export function readStandards(XLSX, data) {
  const wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? "array" : "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const head = (rows[0] || []).map((h) => norm(h).toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const c = {
    part: col("part"), rg: col("resourcegrpid"), site: col("site"), desc: col("description"),
    alt: col("alternate method"), crew: col("prod crew size"), std: col("prod. std", "prod std")
  };
  const missing = Object.entries(c).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) throw new Error("Production Standards: missing column(s) " + missing.join(", "));

  const index = new Map();
  for (const r of rows.slice(1)) {
    const part = norm(r[c.part]);
    const rg = norm(r[c.rg]);
    if (!part || !rg) continue;
    const k = key(part, rg, r[c.site]);
    const e = index.get(k) || { desc: norm(r[c.desc]), main: { std: 0, crew: 0 }, any: { std: 0, crew: 0 } };
    const std = num(r[c.std]) || 0;
    const crew = num(r[c.crew]) || 0;
    const target = norm(r[c.alt]) ? [e.any] : [e.main, e.any];
    for (const t of target) {
      t.std = Math.max(t.std, std);
      t.crew = Math.max(t.crew, crew);
    }
    index.set(k, e);
  }
  return {
    size: index.size,
    lookup(part, rg, site) {
      const e = index.get(key(part, rg, site));
      if (!e) return null;
      const v = e.main.std > 0 || e.main.crew > 0 ? e.main : e.any;
      return { std: v.std, crew: v.crew, desc: e.desc };
    }
  };
}

/** "11-9-26" -> "2026-11-09" (tab names are the Monday of the week). */
export function tabMonday(name) {
  const m = /^\s*(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})\s*$/.exec(name);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])));
  if (d.getUTCDay() !== 1) return null;
  return d.toISOString().slice(0, 10);
}

function cellValue(ws, col, row) {
  const c = ws[XLSXaddr(col, row)];
  return c ? c.v : null;
}
function XLSXaddr(col, row) {
  let s = "";
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s + row;
}

function readBlock(ws, top, k, header, standards) {
  const c0 = 1 + LAYOUT.blockWidth * k;
  const v = top + LAYOUT.valuesOffset;
  const block = {
    ops: num(cellValue(ws, c0 + 1, v)),
    hours: num(cellValue(ws, c0 + 2, v)),
    downtime: num(cellValue(ws, c0 + 3, v)),
    parts: []
  };
  const ranges = [[LAYOUT.scheduledOffsets, true], [LAYOUT.unscheduledOffsets, false]];
  for (const [[a, b], sched] of ranges) {
    for (let r = top + a; r <= top + b; r++) {
      const part = norm(cellValue(ws, c0, r));
      if (!part) continue;
      const forecast = sched ? num(cellValue(ws, c0 + 1, r)) : null;
      const actual = num(cellValue(ws, c0 + 4, r));
      // Standards from the export when the folder has it (doesn't depend on Excel having
      // recalculated the link); otherwise the values the workbook shows.
      let std = num(cellValue(ws, c0 + 2, r)) || 0;
      let crew = num(cellValue(ws, c0 + 3, r)) || 0;
      let desc = "";
      if (standards) {
        const s = standards.lookup(part, header.rg, header.site);
        std = s ? s.std : 0;
        crew = s ? s.crew : 0;
        desc = s ? s.desc : "";
      }
      block.parts.push({ part, desc, forecast, actual, std, crew, sched });
    }
  }
  const empty = block.ops === null && block.parts.every((p) => p.actual === null && p.forecast === null);
  return empty ? null : block;
}

/**
 * One cell's workbook -> { cell, title, rg, site, weeks: { "2026-11-09": { "0-1st": block, ... } } }.
 * Only the weeks asked for are read (this week and last week), so old tabs cost nothing.
 */
export function readCellWorkbook(XLSX, data, fileName, standards, mondays) {
  const m = PLANT.cellFilePattern.exec(fileName);
  const cell = m ? m[1].trim() : fileName;
  const wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? "array" : "buffer" });
  const out = { cell, title: cell, rg: "", site: PLANT.site, weeks: {}, warnings: [] };
  const wanted = new Set(mondays);
  for (const name of wb.SheetNames) {
    const monday = tabMonday(name);
    if (!monday || !wanted.has(monday)) continue;
    const ws = wb.Sheets[name];
    out.rg = norm(cellValue(ws, 2, 1)) || out.rg;
    out.site = norm(cellValue(ws, 5, 1)) || out.site;
    out.title = norm(cellValue(ws, 3, 1)) || out.title;
    const header = { rg: out.rg, site: out.site };
    const blocks = {};
    for (let day = 0; day < 7; day++) {
      for (const shift of ["1st", "2nd", "wknd"]) {
        const pos = blockPosition(day, shift);
        if (!pos) continue;
        const b = readBlock(ws, pos.top, pos.k, header, standards);
        if (b) blocks[day + "-" + shift] = b;
      }
    }
    out.weeks[monday] = blocks;
  }
  if (!out.rg) out.warnings.push("No resource group in B1");
  if (mondays.length && !out.weeks[mondays[0]]) out.warnings.push("No tab for the week of " + mondays[0]);
  return out;
}
