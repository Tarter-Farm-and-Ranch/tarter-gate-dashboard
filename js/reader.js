// Reads the weekly production workbooks and the Production Standards export.
// Works on workbooks already opened (SheetJS shape: { SheetNames, Sheets: { name: { A1: { t, v } } } }),
// which is what the source PC gets from XLSX.read and what the Tarter Portal feed serves
// as JSON. No DOM, no network: the same code runs in browsers, the portal and the tests.

var Gate = Gate || {};

(function (G) {
  const norm = (v) => (v === null || v === undefined ? "" : String(v).trim());
  const key = (part, rg, site) => [norm(part), norm(rg), norm(site)].join("|").toLowerCase();

  function num(v) {
    if (v === null || v === undefined || v === "" || typeof v === "boolean" || v instanceof Date) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // ---------- dates (ISO yyyy-mm-dd, no time zone involved) ----------
  const DAY_MS = 864e5;
  G.addDays = function (iso, n) {
    return new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
  };
  G.mondayOf = function (iso) {
    const d = new Date(iso + "T00:00:00Z").getUTCDay();
    return G.addDays(iso, -((d + 6) % 7));
  };
  /**
   * The week tabs worth reading at this instant: the week of today (and of yesterday, for a
   * 2nd shift running past midnight on a Monday) plus the week before, for the history
   * bars. Uses the UTC date, so it needs no time-zone support (the portal's engine may
   * not have it): in the US the plant's date is the UTC date or the day before.
   */
  G.weeksToRead = function (nowMs) {
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const a = G.mondayOf(G.addDays(today, -1));
    const b = G.mondayOf(today);
    const out = [b];
    if (a !== b) out.push(a);
    out.push(G.addDays(a, -7));
    return out;
  };

  // ---------- cells ----------
  function addr(col, row) {
    let s = "";
    let n = col;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s + row;
  }
  /** Value of the cell at 1-based column/row; errors (#N/A, #REF!) read as empty. */
  function cellValue(ws, col, row) {
    const c = ws[addr(col, row)];
    if (!c || c.t === "e" || c.t === "z") return null;
    return c.v === undefined ? null : c.v;
  }
  function colNumber(letters) {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  }
  /** "A1:Z21845" -> { c0, r0, c1, r1 } (1-based). */
  function range(ref) {
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(norm(ref));
    if (!m) return null;
    return { c0: colNumber(m[1]), r0: Number(m[2]), c1: colNumber(m[3] || m[1]), r1: Number(m[4] || m[2]) };
  }
  /** The cells' extent when a sheet comes without "!ref". */
  function usedRange(ws) {
    let r = null;
    for (const k of Object.keys(ws)) {
      const m = /^([A-Z]+)(\d+)$/.exec(k);
      if (!m) continue;
      const c = colNumber(m[1]), row = Number(m[2]);
      if (!r) r = { c0: c, r0: row, c1: c, r1: row };
      else { r.c0 = Math.min(r.c0, c); r.r0 = Math.min(r.r0, row); r.c1 = Math.max(r.c1, c); r.r1 = Math.max(r.r1, row); }
    }
    return r;
  }
  function firstSheet(wb) {
    if (!wb || !wb.Sheets) return null;
    const name = (wb.SheetNames || []).find((n) => wb.Sheets[n]) || Object.keys(wb.Sheets)[0];
    return name ? wb.Sheets[name] : null;
  }

  /**
   * Production Standards export (Epicor): one row per part + operation + resource group.
   * Columns are found by header so a re-export with columns moved still works.
   * The export repeats operations once per alternate routing (column "Alternate Method"):
   * the main routing wins, an alternate is used only when the part has nothing else in
   * that resource group, and copies are never added up (same rule as the workbooks).
   */
  G.readStandards = function (wb) {
    const ws = firstSheet(wb);
    const r = ws && (range(ws["!ref"]) || usedRange(ws));
    if (!r) throw new Error("Production Standards: the file has no data");
    const head = {};
    for (let c = r.c0; c <= r.c1; c++) {
      const h = norm(cellValue(ws, c, r.r0)).toLowerCase();
      if (h && !(h in head)) head[h] = c;
    }
    const col = (...names) => { for (const n of names) if (n in head) return head[n]; return -1; };
    const c = {
      part: col("part"), rg: col("resourcegrpid"), site: col("site"), desc: col("description"),
      alt: col("alternate method"), crew: col("prod crew size"), std: col("prod. std", "prod std")
    };
    const missing = Object.keys(c).filter((k) => c[k] < 0);
    if (missing.length) throw new Error("Production Standards: missing column(s) " + missing.join(", "));

    const index = new Map();
    for (let row = r.r0 + 1; row <= r.r1; row++) {
      const part = norm(cellValue(ws, c.part, row));
      const rg = norm(cellValue(ws, c.rg, row));
      if (!part || !rg) continue;
      const k = key(part, rg, cellValue(ws, c.site, row));
      const e = index.get(k) || { desc: norm(cellValue(ws, c.desc, row)), main: { std: 0, crew: 0 }, any: { std: 0, crew: 0 } };
      const std = num(cellValue(ws, c.std, row)) || 0;
      const crew = num(cellValue(ws, c.crew, row)) || 0;
      const target = norm(cellValue(ws, c.alt, row)) ? [e.any] : [e.main, e.any];
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
  };

  /**
   * Dashboard Settings.xlsx: the first sheet with a CELL header and a SHOW header. Cells
   * whose SHOW says YES (also Y, SI, X, TRUE, 1, ON) are on the all-cells screen.
   * -> { showCells: ["TK1", ...], unknown: [names that aren't cells in js/config.js] }
   */
  G.readSettings = function (wb) {
    const yes = /^(y|yes|si|sí|x|true|1|on)$/i;
    for (const name of wb.SheetNames || Object.keys(wb.Sheets)) {
      const ws = wb.Sheets[name];
      const r = ws && (range(ws["!ref"]) || usedRange(ws));
      if (!r) continue;
      for (let hr = r.r0; hr <= Math.min(r.r1, r.r0 + 10); hr++) {
        let cc = -1, sc = -1;
        for (let c = r.c0; c <= r.c1; c++) {
          const h = norm(cellValue(ws, c, hr)).toLowerCase();
          if (cc < 0 && /^(cell|work cell|department|celda)$/.test(h)) cc = c;
          if (sc < 0 && /^(show|show on tv|on screen|mostrar)/.test(h)) sc = c;
        }
        if (cc < 0 || sc < 0) continue;
        const showCells = [], unknown = [];
        for (let row = hr + 1; row <= r.r1; row++) {
          const raw = norm(cellValue(ws, cc, row));
          if (!raw || !yes.test(norm(cellValue(ws, sc, row)))) continue;
          const known = G.allCells().find((c) => c.toLowerCase() === raw.toLowerCase());
          if (known) { if (showCells.indexOf(known) < 0) showCells.push(known); } else unknown.push(raw);
        }
        return { showCells, unknown };
      }
    }
    throw new Error("no sheet with CELL and SHOW columns");
  };

  /** "11-9-26" -> "2026-11-09" (tab names are the Monday of the week). */
  G.tabMonday = function (name) {
    const m = /^\s*(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})\s*$/.exec(name);
    if (!m) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])));
    if (d.getUTCDay() !== 1) return null;
    return d.toISOString().slice(0, 10);
  };

  function readBlock(ws, top, k, header, standards) {
    const L = G.LAYOUT;
    const c0 = 1 + L.blockWidth * k;
    const v = top + L.valuesOffset;
    const block = {
      ops: num(cellValue(ws, c0 + 1, v)),
      hours: num(cellValue(ws, c0 + 2, v)),
      downtime: num(cellValue(ws, c0 + 3, v)),
      parts: []
    };
    const ranges = [[L.scheduledOffsets, true], [L.unscheduledOffsets, false]];
    for (const [[a, b], sched] of ranges) {
      for (let r = top + a; r <= top + b; r++) {
        const part = norm(cellValue(ws, c0, r));
        if (!part) continue;
        const forecast = sched ? num(cellValue(ws, c0 + 1, r)) : null;
        const actual = num(cellValue(ws, c0 + 4, r));
        // Standards from the export when it's there (doesn't depend on Excel having
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

  /** The cell's name from its file name ("TK1 Weekly Production.xlsx" -> "TK1"), or null. */
  G.cellNameOf = function (fileName) {
    const base = String(fileName).split(/[\\/]/).pop();
    const m = G.PLANT.cellFilePattern.exec(base);
    if (!m) return null;
    const raw = m[1].trim();
    return G.allCells().find((c) => c.toLowerCase() === raw.toLowerCase()) || raw;
  };

  /**
   * One cell's workbook -> { cell, title, rg, site, weeks: { "2026-11-09": { "0-1st": block, ... } } }.
   * Only the weeks asked for are read, so old tabs cost nothing.
   */
  G.readCellWorkbook = function (wb, fileName, standards, mondays) {
    const cell = G.cellNameOf(fileName) || String(fileName);
    const out = { cell, title: cell, rg: "", site: G.PLANT.site, weeks: {}, warnings: [] };
    const wanted = new Set(mondays);
    for (const name of wb.SheetNames || Object.keys(wb.Sheets)) {
      const monday = G.tabMonday(name);
      const ws = wb.Sheets[name];
      if (!monday || !wanted.has(monday) || !ws) continue;
      out.rg = norm(cellValue(ws, 2, 1)) || out.rg;
      out.site = norm(cellValue(ws, 5, 1)) || out.site;
      out.title = norm(cellValue(ws, 3, 1)) || out.title;
      const header = { rg: out.rg, site: out.site };
      const blocks = {};
      for (let day = 0; day < 7; day++) {
        for (const shift of ["1st", "2nd", "wknd"]) {
          const pos = G.blockPosition(day, shift);
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
  };

  // ---------- a whole folder (source PC) or feed (portal) ----------
  // Excel's lock files, "Copy of", "(1)", backups and OneDrive conflict copies.
  G.SKIP_FILE = /(^~\$)|( - copy)|(^copy of )|(\(\d+\))|backup|\bold\b|-[a-z0-9-]*conflict/i;

  /**
   * Reads every workbook in a folder or feed into the data the screens use.
   *   files  [{ name (path), sig (changes when the file does), modified (ms), load() -> workbook }]
   *   cache  {} kept between calls: unchanged files aren't read again
   *   nowMs  this instant (decides which week tabs are read)
   * -> { data: { cells, timeZone, missingStandards, standardsSavedAt }, warnings: [], failed: [cells not read] }
   * A file that can't be read right now (OneDrive writing it) keeps its last good read.
   */
  G.collect = async function (files, cache, nowMs) {
    const base = (n) => String(n).split(/[\\/]/).pop();
    const usable = files.filter((f) => /\.xlsx$/i.test(base(f.name)) && !G.SKIP_FILE.test(base(f.name)));
    const newestFirst = (a, b) => (b.modified || 0) - (a.modified || 0);
    const warnings = [];

    const std = usable.filter((f) => base(f.name).toLowerCase() === G.PLANT.standardsFile.toLowerCase()).sort(newestFirst)[0];
    if (!std) {
      cache.standards = null;
      cache.standardsSig = "";
      warnings.push(G.PLANT.standardsFile + " not found: using the values the workbooks show");
    } else if (std.sig !== cache.standardsSig) {
      try {
        cache.standards = G.readStandards(await std.load());
        cache.standardsSig = std.sig;
        cache.cells = {}; // read the cells again with the new standards
      } catch (err) {
        warnings.push(G.PLANT.standardsFile + ": " + (err && err.message ? err.message : err) + (cache.standards ? " (using the last good copy)" : " (using the values the workbooks show)"));
      }
    }

    // Which cells are on the screen: Dashboard Settings.xlsx when it's in the folder.
    const settingsName = (G.PLANT.settingsFile || "").toLowerCase();
    const set = settingsName ? usable.filter((f) => base(f.name).toLowerCase() === settingsName).sort(newestFirst)[0] : null;
    if (!set) {
      cache.settings = null;
      cache.settingsSig = "";
    } else if (set.sig !== cache.settingsSig) {
      try {
        cache.settings = G.readSettings(await set.load());
        cache.settingsSig = set.sig;
      } catch (err) {
        warnings.push(G.PLANT.settingsFile + ": " + (err && err.message ? err.message : err) + (cache.settings ? " (using the last good copy)" : ""));
      }
    }
    if (cache.settings) for (const u of cache.settings.unknown) warnings.push(G.PLANT.settingsFile + ": \"" + u + "\" isn't a cell in js/config.js");
    if (cache.settings && !cache.settings.showCells.length) warnings.push(G.PLANT.settingsFile + ": no cell set to YES, showing " + (G.PLANT.showCells.length ? G.PLANT.showCells.join(", ") : "every cell"));

    const mondays = G.weeksToRead(nowMs);
    const byCell = {};
    for (const f of usable.slice().sort(newestFirst)) {
      const name = G.cellNameOf(f.name);
      if (name && !byCell[name]) byCell[name] = f; // the same cell twice: the newest file wins
    }
    cache.cells = cache.cells || {};
    const cells = {};
    const failed = [];
    for (const name of Object.keys(byCell)) {
      const f = byCell[name];
      const k = f.sig + "|" + mondays.join(",") + "|" + (cache.standardsSig || "");
      const had = cache.cells[name];
      if (!had || had.key !== k) {
        try {
          const cell = G.readCellWorkbook(await f.load(), f.name, cache.standards, mondays);
          cell.savedAt = f.modified ? new Date(f.modified).toISOString() : "";
          cache.cells[name] = { key: k, cell };
        } catch (err) {
          warnings.push(name + ": can't read the workbook (" + (err && err.message ? err.message : err) + ")" + (had ? ", showing the last good read" : ""));
          if (!had) { failed.push(name); continue; }
        }
      }
      const cell = cache.cells[name].cell;
      cells[name] = cell;
      for (const w of cell.warnings) warnings.push(name + ": " + w);
      if (G.allCells().indexOf(name) < 0) warnings.push(name + ": not one of the cells in js/config.js, not shown");
    }
    for (const name of Object.keys(cache.cells)) if (!byCell[name]) delete cache.cells[name];
    return {
      data: {
        cells,
        timeZone: G.PLANT.timeZone,
        missingStandards: !std,
        standardsSavedAt: std && std.modified ? new Date(std.modified).toISOString() : "",
        // null: no settings file (the screen uses PLANT.showCells).
        showCells: cache.settings && cache.settings.showCells.length ? cache.settings.showCells.slice() : null
      },
      warnings,
      failed
    };
  };
})(Gate);
