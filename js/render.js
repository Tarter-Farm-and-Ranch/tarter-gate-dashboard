// The two screens as HTML strings, in the West dashboard's look: the plant (all cells) and
// one cell. Text from the workbooks always goes through esc().

var Gate = Gate || {};

(function (G) {
  const PLANT = G.PLANT;
  const band = G.band;
  const LOGO = '<svg class="tarter-mark" role="img" aria-label="Tarter logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 287 285"><rect x="0" y="0" width="287" height="285" fill="#fff"/><path fill="#d32026" d="M0.0,142.5L0.0,0.0L143.5,0.0L287.0,0.0L287.0,142.5L287.0,285.0L143.5,285.0L0.0,285.0L0.0,142.5ZM175.5,208.0L175.5,193.5L160.0,193.2C138.7,192.8 133.4,193.4 126.9,197.3C119.6,201.7 115.7,208.0 115.2,216.6L114.8,223.0L145.1,222.8L175.5,222.5L175.5,208.0ZM114.2,196.3C119.3,194.0 122.9,190.7 126.6,184.8C131.0,177.9 130.3,178.0 175.5,178.0L216.0,178.0L216.0,163.5L216.0,149.0L181.7,149.0L147.4,149.0L141.9,151.8C138.3,153.6 135.2,156.2 132.5,159.8C125.5,169.0 128.1,168.4 88.5,169.0L53.5,169.5L53.2,182.9C53.1,190.3 53.2,197.0 53.5,197.8C53.9,198.9 58.9,199.1 81.7,198.8C107.8,198.5 109.8,198.4 114.2,196.3ZM129.5,150.6C134.2,148.5 137.8,145.1 142.4,138.5C146.1,133.2 147.6,133.0 190.5,133.0L230.0,133.0L230.0,118.5L230.0,103.9L195.8,104.2C155.9,104.5 157.5,104.2 147.6,115.4C143.5,120.1 140.8,122.2 138.2,123.0C135.9,123.6 118.5,124.0 93.8,124.0L53.0,124.0L53.0,137.8C53.0,145.4 53.3,152.0 53.7,152.3C54.0,152.7 70.1,153.0 89.4,153.0C124.1,153.0 124.6,153.0 129.5,150.6ZM144.0,105.9C149.1,103.6 153.5,99.8 155.6,95.8C158.9,89.5 158.5,89.5 203.0,89.0L243.5,88.5L243.5,74.0L243.5,59.5L210.0,59.5C171.1,59.5 172.4,59.2 162.9,70.0C159.3,74.0 156.1,76.6 153.5,77.5C150.3,78.6 140.3,78.9 101.2,79.0L53.0,79.0L53.0,93.5L53.0,108.0L96.2,108.0C137.6,108.0 139.7,107.9 144.0,105.9Z"/></svg>';
  const PERSON = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6" r="4"/><path d="M2 19c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>';

  const esc = (v) => String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const has = (v) => v !== null && v !== undefined && Number.isFinite(v);
  const pctTxt = (v) => (has(v) ? v + "%" : "--");
  const fix1 = (v) => (has(v) ? v.toFixed(1) : "--");
  const int = (v) => (has(v) ? Math.round(v).toLocaleString("en-US") : "0");
  const CHIP = { behind: "▼ BEHIND PACE", off: "✖ OFF PACE" };
  const SHORT_CHIP = { behind: "▼ BEHIND", off: "✖ OFF PACE" };
  const COLOR = { on: "#16A34A", behind: "#F59E0B", off: "#DC2626", none: "#94A3B8" };

  function hhmm(min) {
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return ((h + 11) % 12 + 1) + ":" + String(m).padStart(2, "0") + (h < 12 ? " AM" : " PM");
  }
  /** "12:47:34 PM" and "MONDAY, NOV 9" in plant time. */
  G.clockText = function (now) {
    const tz = PLANT.timeZone;
    return {
      time: new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", second: "2-digit" }).format(now),
      date: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(now).toUpperCase()
    };
  };

  /** Progress ring like West's: grey track, colored arc, the number in the middle. */
  function ring(value, size, color) {
    const p = has(value) ? Math.max(0, Math.min(100, value)) : 0;
    const stroke = Math.round(size / 9);
    const r = (size - stroke) / 2, cx = size / 2, circ = 2 * Math.PI * r;
    const arc = has(value) && p > 0 ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(circ * p / 100).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"/>` : "";
    const txt = !has(value) ? "--" : value > 200 ? ">200%" : value + "%";
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="${stroke}"/>${arc}<text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size / (txt.length > 4 ? 5 : 4.2))}" font-weight="900" fill="#013449">${txt}</text></svg>`;
  }

  function header(view, now, titles, opts) {
    const c = G.clockText(now);
    const s = view.shift;
    const shiftBlock = opts.shiftInHeader
      ? `<div class="hshift"><div class="s1">${esc(s.label)}</div><div class="s2">${hhmm(s.start)} – ${hhmm(s.start + s.minutes)} · ${s.running ? Math.round(s.fraction * 100) + "% DONE" : "ENDED"}</div></div>`
      : "";
    return `<header class="hdr">
    <div class="brand">${LOGO}<span class="word">TARTER<sup>®</sup></span></div>
    <div class="sep"></div>
    <div class="titles"><div class="t1">${esc(titles.top)}</div><div class="t2">${esc(titles.bottom)}</div></div>
    <div class="grow"></div>
    ${opts.sample ? '<div class="chip-sample">SAMPLE DATA · PREVIEW</div>' : ""}
    ${shiftBlock}
    <div class="clock"><div class="c1" data-clock>${esc(c.time)}</div><div class="c2" data-date>${esc(c.date)}</div></div>
  </header>`;
  }

  function kpi(num, title, sub, cls) {
    return `<div class="kpi ${cls || ""}"><div class="kv">${num}</div><div class="kt"><div class="kl">${title}</div><div class="ks">${sub}</div></div></div>`;
  }

  function shiftLeftKpi(view) {
    const s = view.shift;
    const name = s.shift === "wknd" ? "Weekend" : s.shift + " shift";
    if (!s.running) return kpi("ENDED", "LAST SHIFT", name + " · " + hhmm(s.start) + " – " + hhmm(s.start + s.minutes), "kpi-dark");
    const sub = name + " · ends " + hhmm(s.start + s.minutes);
    const h = Math.floor(s.minutesLeft / 60), m = Math.round(s.minutesLeft % 60);
    return kpi(h ? `${h}h ${m}m` : `${m}m`, "SHIFT LEFT", sub, "kpi-dark");
  }

  function tile(t, view) {
    const m = t.m;
    if (!t.hasFile || !m) {
      return `<div class="card tb-none">
      <div class="c-top"><div class="c-name">${esc(t.name)}</div></div>
      <div class="c-meta"><span class="c-rg">${esc(t.rg)}</span></div>
      <div class="c-empty"><b>${t.hasFile ? "NOTHING ENTERED" : "NO FILE YET"}</b><span>${t.hasFile ? "for " + esc(view.shift.label.toLowerCase()) : "No " + esc(t.name) + " workbook in the folder"}</span></div></div>`;
    }
    const b = band(m.eff);
    const sb = band(m.schedPace);
    const uplhPct = has(m.uplh) && m.goal ? Math.min(100, m.uplh / m.goal * 100) : 0;
    const prev = t.history.filter((h) => !h.now).slice(-1)[0];
    const notes = [];
    if (m.noStd.length) notes.push(`<div class="note n-red"><b>${m.noStd.length} PART${m.noStd.length > 1 ? "S" : ""} · NO STANDARD</b><span>for ${esc(t.rg)} · add in Epicor</span></div>`);
    if (!m.ops) notes.push(`<div class="note n-amber"><b>ENTER # OF OPERATORS</b><span>to get % to goal</span></div>`);
    else if (m.downtime) notes.push(`<div class="note n-amber"><b>DOWNTIME · ${int(m.downtime)} MIN</b></div>`);
    const extra = m.made - m.schedMade;
    return `<div class="card tb-${b}">
    <div class="c-top"><div class="c-name">${esc(t.name)}</div></div>
    <div class="c-meta"><span class="pill">${PERSON}${int(m.ops)}</span><span class="c-rg">${esc(t.rg)}</span><span class="grow"></span>${SHORT_CHIP[b] ? `<span class="chip ch-${b}">${SHORT_CHIP[b]}</span>` : ""}</div>
    <div class="hero h-${b}">
      <div class="h-l">UPLH THIS SHIFT</div>
      <div class="h-v"><b>${fix1(m.uplh)}</b><span>/ ${fix1(m.goal)} <em>GOAL</em></span></div>
      <div class="track"><i class="bg-${b === "none" ? "none" : b} stripes" style="width:${uplhPct.toFixed(0)}%"></i></div>
    </div>
    <div class="rings">
      <div class="rc">${ring(m.eff, 66, COLOR[b])}<div class="rl">TO<br>GOAL</div></div>
      <div class="rdiv"></div>
      <div class="rc">${ring(m.adherence, 66, COLOR[sb])}<div class="rl">SCHED.<br>DONE</div></div>
    </div>
    <div class="duo"><div class="mini"><div class="ml">ACTUAL</div><div class="mv">${int(m.schedMade)}</div></div><div class="mini"><div class="ml">SCHEDULED</div><div class="mv">${int(m.forecast)}</div></div></div>
    ${notes.length ? "" : `<div class="c-sub">${extra > 0 ? "+" + int(extra) + " pcs not on schedule" : ""}</div>`}
    <div class="grow"></div>
    ${notes.slice(0, 1).join("")}
    <div class="c-last">${prev ? "Last shift " + esc(prev.day + " " + prev.shift) + ": <b class=\"t-" + band(prev.eff) + "\">" + prev.eff + "%</b>" : "&nbsp;"}</div>
  </div>`;
  }

  G.renderPlant = function (view, now, opts) {
    opts = opts || {};
    const p = view.plant;
    const rows = [];
    let row = [], used = 0;
    for (const area of PLANT.areas) {
      if (used + area.cells.length > 7) { rows.push(row); row = []; used = 0; }
      row.push(area); used += area.cells.length;
    }
    rows.push(row);
    const legend = `<div class="card legend">
      <div class="lg-h">HOW IT'S MEASURED</div>
      <div class="lg-t"><b>TO GOAL</b> = standard hours earned by every part made ÷ operators × hours worked.</div>
      <div class="lg-t"><b>UPLH goal</b> follows the parts on the schedule (Epicor standards).</div>
      <div class="lg-t"><b>SCHED. DONE</b> = scheduled pieces made ÷ forecast.</div>
      <div class="grow"></div>
      <div class="lg-k"><i class="bg-on"></i>${PLANT.bands.on}%+ ON PACE</div>
      <div class="lg-k"><i class="bg-behind"></i>${PLANT.bands.behind}–${PLANT.bands.on - 1}% BEHIND PACE</div>
      <div class="lg-k"><i class="bg-off"></i>UNDER ${PLANT.bands.behind}% OFF PACE</div></div>`;
    const areaAvg = (cells) => {
      const vals = view.tiles.filter((t) => cells.indexOf(t.name) >= 0 && t.m && has(t.m.eff)).map((t) => Math.min(t.m.eff, 150));
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) + "% to goal" : "no data yet";
    };
    const rowsHtml = rows.map((areas, i) => {
      const count = areas.reduce((n, a) => n + a.cells.length, 0);
      const fill = i === rows.length - 1 && count < 7;
      const bands = areas.map((a) => `<div class="band" style="grid-column:span ${a.cells.length}"><b>${esc(a.name)}</b><span>${a.cells.length} cells · ${areaAvg(a.cells)}</span></div>`).join("")
        + (fill ? `<div style="grid-column:span ${7 - count}"></div>` : "");
      const tiles = areas.reduce((all, a) => all.concat(a.cells), []).map((n) => tile(view.tiles.find((t) => t.name === n), view)).join("") + (fill ? legend : "");
      return `<section class="arow"><div class="bands">${bands}</div><div class="tiles">${tiles}</div></section>`;
    }).join("");
    const effBand = band(p.eff);
    const total = view.tiles.length;
    const kpis = kpi(`<span class="t-${effBand}">${has(p.eff) ? p.eff + "<small>%</small>" : "--"}</span>`, "PLANT TO GOAL", `Earned ÷ paid hours · ${p.cellsWithData} of ${total} cells`)
      + kpi(has(p.adherence) ? p.adherence + "<small>%</small>" : "--", "SCHEDULE", `Avg done · ${view.shift.running ? Math.round(view.shift.fraction * 100) : 100}% expected by now`)
      + kpi(int(p.ops), "OPERATORS", "This shift · all cells")
      + kpi(`<span class="${p.downtime ? "t-behind" : ""}">${int(p.downtime)}</span><small>min</small>`, "DOWNTIME", "This shift · all cells")
      + (p.noStd
        ? kpi(`<span class="t-off">${p.noStd}</span>`, "NO STANDARD", esc(p.noStdCells.join(", ")) + " · add in Epicor", "kpi-red")
        : kpi(`<span class="t-on">✓</span>`, "STANDARDS", "Every part has a standard"))
      + shiftLeftKpi(view);
    return `<div class="screen">${header(view, now, { top: "SMART PRODUCTION CENTER", bottom: "DAILY PRODUCTION · " + PLANT.name.toUpperCase() + " (" + PLANT.code + ")" }, opts)}
  <main class="plant"><div class="kpis">${kpis}</div>${rowsHtml}</main>${opts.alert ? `<div class="alert">${esc(opts.alert)}</div>` : ""}</div>`;
  };

  G.renderCell = function (view, name, now, opts) {
    opts = opts || {};
    const t = view.tiles.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!t) return `<div class="screen"><div class="waiting">Unknown cell "${esc(name)}"</div></div>`;
    const m = t.m;
    const b = m ? band(m.eff) : "none";
    const sb = m ? band(m.schedPace) : "none";
    const fraction = view.shift.running ? view.shift.fraction : 1;
    const parts = t.block ? t.block.parts : [];
    let lineDone = false;
    const rows = parts.map((p) => {
      let pre = "";
      if (!p.sched && !lineDone) { pre = `<div class="pline">NOT SCHEDULED · MADE THIS SHIFT</div>`; lineDone = true; }
      const ok = p.std > 0 && p.crew > 0;
      const done = p.forecast ? (p.actual || 0) / p.forecast : null;
      const pb = done === null ? "none" : band(fraction ? Math.round(done / fraction * 100) : 0);
      return pre + `<div class="prow ${ok ? "" : "prow-red"}">
      <span class="pn">${esc(p.part)}</span><span class="pd">${esc(p.desc)}</span>
      <span class="pf">${p.forecast === null ? "—" : int(p.forecast)}</span><span class="pa">${p.actual === null ? "—" : int(p.actual)}</span>
      <span class="ptrack"><i class="bg-${pb} stripes" style="width:${done === null ? 0 : Math.min(Math.round(done * 100), 100)}%"></i></span>
      <span class="ps ${ok ? "" : "t-off"}">${ok ? +p.std.toFixed(2) : "NO STD"}</span><span class="ps ${ok ? "" : "t-off"}">${ok ? p.crew : "—"}</span>
      <span class="pst t-${done === null ? (ok ? "none" : "off") : pb}">${done === null ? (ok ? "EXTRA" : "CHECK") : Math.round(done * 100) + "%"}</span></div>`;
    }).join("");
    const hist = t.history.map((h) => `<div class="hcol"><span class="t-${band(h.eff)}">${h.eff}%</span><i class="bg-${band(h.eff)}${h.now ? " stripes" : ""}" style="height:${Math.round(Math.min(h.eff, 115) * 1.05)}px;opacity:${h.now ? 1 : 0.75}"></i><em>${h.now ? "NOW" : esc(h.day + " " + h.shift)}</em></div>`).join("");
    const flag = m && m.noStd.length ? `<div class="note n-red wide"><b>${m.noStd.length} PART${m.noStd.length > 1 ? "S" : ""} WITH NO ${esc(t.rg)} STANDARD IN EPICOR</b><span>${esc(m.noStd.join(", "))} · not counted in the goal: add ${m.noStd.length > 1 ? "them" : "it"} in Epicor</span></div>` : "";
    const uplhPct = m && has(m.uplh) && m.goal ? Math.min(100, m.uplh / m.goal * 100) : 0;
    const hoursPlan = t.block && t.block.hours ? t.block.hours : PLANT.shifts[view.shift.shift].hours;
    return `<div class="screen">${header(view, now, { top: t.name.toUpperCase() + (t.rg ? " · " + t.rg : ""), bottom: "DAILY PRODUCTION · " + PLANT.name.toUpperCase() + " (" + PLANT.code + ")" }, Object.assign({ shiftInHeader: true }, opts))}
  <main class="cell">
    <section class="card cleft tb-${b}">
      <div class="bigring">${ring(m ? m.eff : null, 250, COLOR[b])}
        <div class="br-side"><div class="br-l">TO GOAL</div>${CHIP[b] ? `<span class="chip ch-${b}">${CHIP[b]}</span>` : b === "on" ? `<span class="chip ch-on">✓ ON PACE</span>` : ""}
          <div class="br-t">${m && m.paid ? m.earned.toFixed(1) + " standard hours earned in " + m.paid.toFixed(1) + " hours worked (" + m.ops + " operators)" : "Enter # of operators and hours to get % to goal"}</div></div></div>
      <div class="hero big h-${b}">
        <div class="h-l">UPLH THIS SHIFT</div>
        <div class="h-v"><b>${fix1(m ? m.uplh : null)}</b><span>/ ${fix1(m ? m.goal : null)} <em>UPLH GOAL · EPICOR</em></span></div>
        <div class="track"><i class="bg-${b} stripes" style="width:${uplhPct.toFixed(0)}%"></i></div>
      </div>
      <div class="sched">
        <div class="rc">${ring(m ? m.adherence : null, 96, COLOR[sb])}<div class="rl">SCHED.<br>DONE<small>${Math.round(fraction * 100)}% expected</small></div></div>
        <div class="duo"><div class="mini"><div class="ml">ACTUAL</div><div class="mv">${int(m ? m.schedMade : 0)}</div></div><div class="mini"><div class="ml">SCHEDULED</div><div class="mv">${int(m ? m.forecast : 0)}</div></div></div>
      </div>
      <div class="trio">
        <div class="mini"><div class="ml">OPERATORS</div><div class="mv">${int(m ? m.ops : 0)}</div></div>
        <div class="mini"><div class="ml">HOURS WORKED</div><div class="mv">${(view.shift.hoursDone || 0).toFixed(1)}<small>/ ${hoursPlan}</small></div></div>
        <div class="mini ${m && m.downtime ? "m-amber" : ""}"><div class="ml">DOWNTIME</div><div class="mv">${int(m ? m.downtime : 0)}<small>min</small></div></div>
      </div>
    </section>
    <section class="cright">
      <div class="card parts"><div class="ph">PARTS THIS SHIFT</div>
        <div class="phead"><span>PART #</span><span>DESCRIPTION (EPICOR)</span><span>FORECAST</span><span>ACTUAL</span><span>PROGRESS</span><span>STD /HR</span><span>CREW</span><span>STATUS</span></div>
        ${rows || '<div class="muted pad">Nothing entered for this shift yet.</div>'}<div class="grow"></div>${flag}</div>
      <div class="card hist"><div class="hh"><b>LAST SHIFTS · TO GOAL</b><span>From this week's and last week's tabs</span></div><div class="hcols">${hist}</div></div>
    </section>
  </main>${opts.alert ? `<div class="alert">${esc(opts.alert)}</div>` : ""}</div>`;
  };

  G.renderWaiting = function (now, text, opts) {
    const fake = { shift: { label: "", start: 0, minutes: 0, running: false } };
    return `<div class="screen">${header(fake, now, { top: "SMART PRODUCTION CENTER", bottom: "DAILY PRODUCTION · " + PLANT.name.toUpperCase() + " (" + PLANT.code + ")" }, opts || {})}<div class="waiting">${esc(text)}</div></div>`;
  };
})(Gate);
