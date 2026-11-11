// Shift clock and the numbers on the screens. Pure functions (no DOM), tested in Node.

var Gate = Gate || {};

(function (G) {
  const PLANT = G.PLANT;
  const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  /** Plant wall-clock fields for an instant, in the plant's time zone. */
  function plantClock(date, timeZone) {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || PLANT.timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short"
    });
    const p = {};
    for (const part of f.formatToParts(date)) p[part.type] = part.value;
    const iso = p.year + "-" + String(p.month).padStart(2, "0") + "-" + String(p.day).padStart(2, "0");
    return { iso, dayIndex: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday), minutes: (Number(p.hour) % 24) * 60 + Number(p.minute), seconds: Number(p.second) || 0 };
  }

  function shiftsOn(dayIndex) {
    return dayIndex <= 4 ? ["1st", "2nd"] : ["wknd"];
  }
  function instance(dayISO, dayIndex, shift) {
    const s = PLANT.shifts[shift];
    return { dayISO, dayIndex, shift, label: s.label, start: s.start, minutes: s.minutes, hours: s.hours, monday: G.mondayOf(dayISO), key: dayIndex + "-" + shift };
  }

  /**
   * Which shift is running now, or the last one that ran (the latest with data, if any).
   * fraction = part of the shift already worked (1 when it has ended).
   */
  function currentShift(clock, hasData) {
    const candidates = [];
    for (let back = 0; back <= 7; back++) {
      const dayISO = G.addDays(clock.iso, -back);
      const dayIndex = (clock.dayIndex - back + 70) % 7;
      for (const shift of shiftsOn(dayIndex).slice().reverse()) {
        const inst = instance(dayISO, dayIndex, shift);
        const elapsed = clock.minutes + back * 1440 - inst.start;
        if (elapsed < 0) continue;
        candidates.push(Object.assign(inst, { elapsed, running: elapsed < inst.minutes }));
      }
    }
    candidates.sort((a, b) => a.elapsed - b.elapsed);
    const running = candidates.find((c) => c.running);
    if (running) return finish(running);
    const last = candidates.find((c) => !hasData || hasData(c)) || candidates[0];
    return finish(last);
  }
  function finish(inst) {
    const fraction = Math.min(1, Math.max(0, inst.elapsed / inst.minutes));
    return Object.assign(inst, {
      fraction,
      hoursDone: Math.round(inst.hours * fraction * 10) / 10,
      minutesLeft: inst.running ? Math.max(0, inst.minutes - inst.elapsed) : 0
    });
  }

  function band(pct) {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return "none";
    return pct >= PLANT.bands.on ? "on" : pct >= PLANT.bands.behind ? "behind" : "off";
  }

  const hasStd = (p) => p.std > 0 && p.crew > 0;

  /** Numbers for one shift block. `fraction` scales the paid hours while the shift runs. */
  function blockMetrics(block, fraction) {
    if (!block) return null;
    if (fraction === undefined) fraction = 1;
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
    const adherence = forecast > 0 ? pct(schedMade / forecast) : null;
    const expected = pct(fraction);
    return {
      ops, hours: block.hours, downtime: block.downtime || 0,
      earned, paid, made, forecast, schedMade,
      eff: paid > 0 ? pct(earned / paid) : null,
      uplh: paid > 0 ? made / paid : null,
      goal: goalHrs > 0 ? goalPcs / goalHrs : null,
      adherence,
      expected,
      // Schedule against what should be done by now (the shift is part way through).
      schedPace: adherence === null ? null : expected > 0 ? Math.round(adherence / expected * 100) : null,
      noStd
    };
  }

  /** % to goal of the cell's last shifts (this week and last), oldest first, current last. */
  function history(cell, shift, count) {
    count = count || 8;
    const out = [];
    for (let back = 0; back < 14 && out.length < count; back++) {
      const dayISO = G.addDays(shift.dayISO, -back);
      const dayIndex = (shift.dayIndex - back + 70) % 7;
      const week = cell.weeks && cell.weeks[G.mondayOf(dayISO)];
      if (!week) continue;
      for (const s of shiftsOn(dayIndex).slice().reverse()) {
        if (back === 0 && s === "2nd" && shift.shift === "1st") continue;
        const b = week[dayIndex + "-" + s];
        const isNow = back === 0 && s === shift.shift;
        const m = blockMetrics(b, isNow ? shift.fraction : 1);
        if (!m || m.eff === null) continue;
        out.push({ day: DAYS[dayIndex], shift: s === "wknd" ? "WKND" : s.toUpperCase(), eff: m.eff, now: isNow });
        if (out.length >= count) break;
      }
    }
    return out.reverse();
  }

  /** The most recent finished shift before `shift` that has anything entered (actuals or a forecast). */
  function lastShiftWithData(cell, shift) {
    for (let back = 0; back < 14; back++) {
      const dayISO = G.addDays(shift.dayISO, -back);
      const dayIndex = (shift.dayIndex - back + 70) % 7;
      const week = cell.weeks && cell.weeks[G.mondayOf(dayISO)];
      if (!week) continue;
      for (const s of shiftsOn(dayIndex).slice().reverse()) {
        if (back === 0 && (s === shift.shift || (s === "2nd" && shift.shift === "1st"))) continue;
        const b = week[dayIndex + "-" + s];
        if (!b || !b.parts.some((p) => p.actual !== null || p.forecast !== null)) continue;
        return { day: DAYS[dayIndex], shift: s === "wknd" ? "WKND" : s.toUpperCase(), dayISO, m: blockMetrics(b, 1) };
      }
    }
    return null;
  }

  /** Everything the screens need, from the raw data and the current time. */
  function buildView(data, now) {
    now = now || new Date();
    const clock = plantClock(now);
    const cells = data && data.cells ? data.cells : {};
    const hasData = (inst) => Object.keys(cells).some((n) => cells[n].weeks && cells[n].weeks[inst.monday] && cells[n].weeks[inst.monday][inst.key]);
    const shift = currentShift(clock, hasData);
    const tiles = [];
    let earned = 0, paid = 0, ops = 0, downtime = 0, cellsWithData = 0, shownCount = 0;
    const adh = [], noStdCells = [];
    const shown = {};
    const shownAreas = G.shownAreas(data ? data.showCells : null);
    for (const a of shownAreas) for (const n of a.cells) shown[n] = true;
    for (const area of PLANT.areas) {
      for (const name of area.cells) {
        const c = cells[name];
        const block = c && c.weeks && c.weeks[shift.monday] ? c.weeks[shift.monday][shift.key] || null : null;
        const m = blockMetrics(block, shift.fraction);
        tiles.push({ name, area: area.name, rg: c ? c.rg : "", savedAt: c && c.savedAt ? c.savedAt : "", hasFile: !!c, block, m, history: c ? history(c, shift) : [], shown: !!shown[name], lastShift: c && !m ? lastShiftWithData(c, shift) : null });
        // The plant numbers cover the cells on the all-cells screen.
        if (!shown[name]) continue;
        shownCount++;
        if (m && m.paid > 0) { earned += m.earned; paid += m.paid; }
        if (m) { cellsWithData++; ops += m.ops; downtime += m.downtime; if (m.adherence !== null) adh.push(m.adherence); }
        if (m && m.noStd.length) noStdCells.push(name);
      }
    }
    return {
      now, clock, shift, tiles, shownAreas,
      expected: data && data.expected ? data.expected : {},
      safety: data && data.safety ? data.safety : null,
      plant: {
        eff: paid > 0 ? Math.round(earned / paid * 100) : null,
        adherence: adh.length ? Math.round(adh.reduce((a, b) => a + b, 0) / adh.length) : null,
        ops, downtime, noStdCells, cellsWithData, cellsShown: shownCount,
        noStd: tiles.reduce((t, x) => t + (x.shown && x.m ? x.m.noStd.length : 0), 0)
      }
    };
  }

  G.plantClock = plantClock;
  G.currentShift = currentShift;
  G.band = band;
  G.blockMetrics = blockMetrics;
  G.history = history;
  G.buildView = buildView;
})(Gate);
