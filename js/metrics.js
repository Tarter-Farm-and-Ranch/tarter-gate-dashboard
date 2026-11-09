// Shift clock and the numbers on the screens. Pure functions (no DOM), tested in Node.

import { PLANT } from "./config.js";

const DAY_MS = 864e5;

/** Plant wall-clock fields for an instant, in the plant's time zone. */
export function plantClock(date, timeZone = PLANT.timeZone) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short"
  });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  const iso = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { iso, dayIndex: (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).indexOf(p.weekday), minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function addDays(iso, n) {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
}
export function mondayOf(iso) {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return addDays(iso, -((d + 6) % 7));
}

// Every shift instance as [production day, shift], starting with the one that holds `clock`
// and going back in time.
function shiftsOn(dayIndex) {
  return dayIndex <= 4 ? ["1st", "2nd"] : ["wknd"];
}
function instance(dayISO, dayIndex, shift) {
  const s = PLANT.shifts[shift];
  return { dayISO, dayIndex, shift, label: s.label, start: s.start, minutes: s.minutes, hours: s.hours, monday: mondayOf(dayISO), key: dayIndex + "-" + shift };
}

/**
 * Which shift is running now, or the last one that ran.
 * fraction = part of the shift already worked (1 when it has ended).
 */
export function currentShift(clock, hasData = () => true) {
  const candidates = [];
  for (let back = 0; back <= 7; back++) {
    const dayISO = addDays(clock.iso, -back);
    const dayIndex = (clock.dayIndex - back + 70) % 7;
    const list = shiftsOn(dayIndex).slice().reverse();
    for (const shift of list) {
      const inst = instance(dayISO, dayIndex, shift);
      const elapsed = clock.minutes + back * 1440 - inst.start;
      if (elapsed < 0) continue;
      candidates.push(Object.assign(inst, { elapsed, running: elapsed < inst.minutes }));
    }
  }
  candidates.sort((a, b) => a.elapsed - b.elapsed);
  const running = candidates.find((c) => c.running);
  if (running) return finish(running);
  const last = candidates.find((c) => hasData(c)) || candidates[0];
  return finish(last);
}
function finish(inst) {
  const fraction = Math.min(1, Math.max(0, inst.elapsed / inst.minutes));
  return Object.assign(inst, { fraction, hoursDone: Math.round(inst.hours * fraction * 10) / 10 });
}

export function band(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "none";
  return pct >= PLANT.bands.on ? "on" : pct >= PLANT.bands.behind ? "behind" : "off";
}

const hasStd = (p) => p.std > 0 && p.crew > 0;

/** Numbers for one shift block. `fraction` scales the paid hours while the shift runs. */
export function blockMetrics(block, fraction = 1) {
  if (!block) return null;
  let earned = 0, made = 0, forecast = 0, schedMade = 0, goalPcs = 0, goalHrs = 0;
  const noStd = [];
  for (const p of block.parts) {
    const act = p.actual || 0;
    made += act;
    if (hasStd(p)) earned += act * p.crew / p.std;
    else if (act > 0 || p.forecast) noStd.push(p.part);
    if (p.sched && p.forecast) {
      forecast += p.forecast;
      schedMade += act;
      if (hasStd(p)) { goalPcs += p.forecast; goalHrs += p.forecast * p.crew / p.std; }
    }
  }
  const ops = block.ops || 0;
  const paid = ops * (block.hours || 0) * fraction;
  const pct = (x) => (Number.isFinite(x) ? Math.round(x * 100) : null);
  return {
    ops, hours: block.hours, downtime: block.downtime || 0,
    earned, paid, made, forecast, schedMade,
    eff: paid > 0 ? pct(earned / paid) : null,
    uplh: paid > 0 ? made / paid : null,
    goal: goalHrs > 0 ? goalPcs / goalHrs : null,
    adherence: forecast > 0 ? pct(schedMade / forecast) : null,
    expected: pct(fraction),
    noStd
  };
}

/** Everything the screens need, from the published raw data and the current time. */
export function buildView(data, now = new Date()) {
  const clock = plantClock(now);
  const cells = data && data.cells ? data.cells : {};
  const hasData = (inst) => Object.values(cells).some((c) => c.weeks && c.weeks[inst.monday] && c.weeks[inst.monday][inst.key]);
  const shift = currentShift(clock, hasData);
  const tiles = [];
  let earned = 0, paid = 0, ops = 0, downtime = 0;
  const adh = [], noStdCells = [];
  for (const area of PLANT.areas) {
    for (const name of area.cells) {
      const c = cells[name];
      const block = c && c.weeks && c.weeks[shift.monday] ? c.weeks[shift.monday][shift.key] : null;
      const m = blockMetrics(block, shift.fraction);
      const tile = { name, area: area.name, rg: c ? c.rg : "", hasFile: !!c, block, m, history: c ? history(c, shift) : [] };
      tiles.push(tile);
      if (m && m.paid > 0) { earned += m.earned; paid += m.paid; }
      if (m) { ops += m.ops; downtime += m.downtime; if (m.adherence !== null) adh.push(m.adherence); }
      if (m && m.noStd.length) noStdCells.push(name);
    }
  }
  const plantEff = paid > 0 ? Math.round(earned / paid * 100) : null;
  return {
    clock, shift, tiles,
    plant: {
      eff: plantEff,
      adherence: adh.length ? Math.round(adh.reduce((a, b) => a + b, 0) / adh.length) : null,
      ops, downtime, noStdCells,
      noStd: tiles.reduce((t, x) => t + (x.m ? x.m.noStd.length : 0), 0)
    }
  };
}

/** % to goal of the cell's last shifts (this week and last), oldest first, current last. */
export function history(cell, shift, count = 8) {
  const out = [];
  for (let back = 0; back < 14 && out.length < count; back++) {
    const dayISO = addDays(shift.dayISO, -back);
    const dayIndex = (shift.dayIndex - back + 70) % 7;
    const monday = mondayOf(dayISO);
    const week = cell.weeks && cell.weeks[monday];
    if (!week) continue;
    for (const s of shiftsOn(dayIndex).slice().reverse()) {
      if (back === 0 && s === "2nd" && shift.shift === "1st") continue;
      const b = week[dayIndex + "-" + s];
      const isNow = back === 0 && s === shift.shift;
      const m = blockMetrics(b, isNow ? shift.fraction : 1);
      if (!m || m.eff === null) continue;
      out.push({ day: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][dayIndex], shift: s === "wknd" ? "WKND" : s.toUpperCase(), eff: m.eff, now: isNow });
      if (out.length >= count) break;
    }
  }
  return out.reverse();
}
