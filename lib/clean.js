// Only the fields the screens use are stored, numbers as numbers and text trimmed,
// so nothing unexpected reaches the TVs.

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v, max) => (v === null || v === undefined ? "" : String(v).slice(0, max));
const BLOCK_KEY = /^[0-6]-(1st|2nd|wknd)$/;
const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

function cleanBlock(b) {
  if (!b || typeof b !== "object") return null;
  return {
    ops: num(b.ops), hours: num(b.hours), downtime: num(b.downtime),
    parts: (Array.isArray(b.parts) ? b.parts : []).slice(0, 40).map((p) => ({
      part: str(p.part, 40), desc: str(p.desc, 60), forecast: num(p.forecast), actual: num(p.actual),
      std: num(p.std) || 0, crew: num(p.crew) || 0, sched: !!p.sched
    }))
  };
}

export function cleanData(data) {
  if (!data || typeof data !== "object" || !data.cells || typeof data.cells !== "object") return null;
  const cells = {};
  for (const [name, c] of Object.entries(data.cells).slice(0, 40)) {
    if (!c || typeof c !== "object") continue;
    const weeks = {};
    for (const [w, blocks] of Object.entries(c.weeks || {}).slice(0, 4)) {
      if (!WEEK_KEY.test(w) || !blocks || typeof blocks !== "object") continue;
      weeks[w] = {};
      for (const [k, b] of Object.entries(blocks)) if (BLOCK_KEY.test(k)) weeks[w][k] = cleanBlock(b);
    }
    cells[str(name, 40)] = {
      rg: str(c.rg, 20), site: str(c.site, 20), title: str(c.title, 40), savedAt: str(c.savedAt, 30),
      warnings: (Array.isArray(c.warnings) ? c.warnings : []).slice(0, 5).map((w) => str(w, 120)), weeks
    };
  }
  return {
    cells,
    standardsSavedAt: str(data.standardsSavedAt, 30),
    missingStandards: !!data.missingStandards,
    timeZone: str(data.timeZone, 40)
  };
}

// Postgres jsonb reorders object keys, so compare with sorted keys.
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value === undefined ? null : value);
}
