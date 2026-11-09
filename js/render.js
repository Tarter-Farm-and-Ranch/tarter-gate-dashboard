// The two screens as HTML strings: the plant (all cells) and one cell. Text from the
// workbooks always goes through esc().

import { PLANT } from "./config.js";
import { band } from "./metrics.js";

const esc = (v) => String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v === null || v === undefined ? "--" : v + "%");
const fix1 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "--" : v.toFixed(1));
const LABEL = { on: "ON PACE", behind: "BEHIND PACE", off: "OFF PACE", none: "NO DATA" };

function clockText(now, timeZone) {
  const t = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(now);
  const d = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" }).format(now).toUpperCase();
  return { t, d };
}
function hhmm(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return ((h + 11) % 12 + 1) + ":" + String(m).padStart(2, "0") + (h < 12 ? " AM" : " PM");
}

function header(view, now, subtitle, sample) {
  const { t, d } = clockText(now, PLANT.timeZone);
  const s = view.shift;
  const state = s.running ? Math.round(s.fraction * 100) + "% OF SHIFT DONE" : "SHIFT ENDED";
  return `<header class="hdr">
    <div class="logo"><div class="mark"><i></i><i></i><i></i></div><div class="word">TARTER</div></div>
    <div class="sep"></div>
    <div class="titles"><div class="t1">${esc(subtitle.top)}</div><div class="t2">${esc(subtitle.bottom)}</div></div>
    <div class="grow"></div>
    ${sample ? '<div class="chip-sample">SAMPLE DATA · PREVIEW</div>' : ""}
    <div class="shift"><div class="s1">${esc(s.label)}</div><div class="s2">${hhmm(s.start)} – ${hhmm(s.start + s.minutes)} · ${state}</div></div>
    <div class="clock"><div class="c1">${esc(t)}</div><div class="c2">${esc(d)}</div></div>
  </header>`;
}

function tile(t) {
  const m = t.m;
  if (!t.hasFile || !m) {
    const why = !t.hasFile ? "No workbook in the folder yet" : "Nothing entered for this shift";
    return `<div class="tile b-none"><div class="tname">${esc(t.name)}</div>
      <span class="chip c-none">${t.hasFile ? "NO DATA" : "NO FILE"}</span>
      <div class="big none">--</div><div class="muted">${why}</div></div>`;
  }
  const b = m.eff === null ? "none" : band(m.eff);
  const adhBand = m.adherence === null ? "none" : band(m.expected ? Math.round(m.adherence / m.expected * 100) : m.adherence);
  const prev = t.history.filter((h) => !h.now).slice(-1)[0];
  const foot = m.noStd.length
    ? `<div class="flag">${m.noStd.length} part${m.noStd.length > 1 ? "s" : ""} with no standard for ${esc(t.rg)}</div>`
    : !m.ops ? `<div class="note">Enter # of operators</div>`
    : `<div class="muted">${m.downtime ? "Downtime " + m.downtime + " min" : "No downtime logged"}</div>`;
  return `<div class="tile b-${b}">
    <div class="trow"><div class="tname">${esc(t.name)}</div><div class="rg">${esc(t.rg)}</div></div>
    <div class="trow"><span class="chip c-${b}">${LABEL[b]}</span><span class="ops">${m.ops} ops</span></div>
    <div class="bigrow"><span class="big t-${b}">${pct(m.eff)}</span><span class="tg">TO GOAL</span></div>
    <div class="line">UPLH ${fix1(m.uplh)} / ${fix1(m.goal)} goal</div>
    <div class="bar"><i class="bg-${adhBand}" style="width:${Math.min(m.adherence || 0, 100)}%"></i></div>
    <div class="line2">${m.schedMade} / ${m.forecast} PCS · ${pct(m.adherence)}</div>
    <div class="muted">${prev ? "Last shift (" + esc(prev.day + " " + prev.shift) + "): " + prev.eff + "%" : "&nbsp;"}</div>
    <div class="grow"></div>${foot}</div>`;
}

export function renderPlant(view, now, opts = {}) {
  const p = view.plant;
  const rows = [];
  let row = [];
  let used = 0;
  for (const area of PLANT.areas) {
    if (used + area.cells.length > 7) { rows.push(row); row = []; used = 0; }
    row.push(area); used += area.cells.length;
  }
  rows.push(row);
  const legend = `<div class="tile legend"><div class="lg-h">HOW IT'S MEASURED</div>
    <div class="lg-t">TO GOAL = standard hours earned by every part made ÷ operators × hours worked.</div>
    <div class="lg-t">UPLH goal follows the parts on the schedule (Epicor standards).</div><div class="grow"></div>
    <div class="lg-k"><i class="bg-on"></i>${PLANT.bands.on}%+ ON PACE</div>
    <div class="lg-k"><i class="bg-behind"></i>${PLANT.bands.behind}–${PLANT.bands.on - 1}% BEHIND PACE</div>
    <div class="lg-k"><i class="bg-off"></i>UNDER ${PLANT.bands.behind}% OFF PACE</div></div>`;
  const areaAvg = (cells) => {
    const vals = view.tiles.filter((t) => cells.includes(t.name) && t.m && t.m.eff !== null).map((t) => Math.min(t.m.eff, 150));
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) + "% to goal" : "no data yet";
  };
  const rowsHtml = rows.map((areas, i) => {
    const count = areas.reduce((n, a) => n + a.cells.length, 0);
    const bands = areas.map((a) => `<div class="band" style="grid-column:span ${a.cells.length}"><b>${esc(a.name)}</b><span>${a.cells.length} cells · ${areaAvg(a.cells)}</span></div>`).join("")
      + (i === rows.length - 1 && count < 7 ? `<div style="grid-column:span ${7 - count}"></div>` : "");
    const tiles = areas.flatMap((a) => a.cells).map((n) => tile(view.tiles.find((t) => t.name === n))).join("")
      + (i === rows.length - 1 && count < 7 ? legend : "");
    return `<section class="arow"><div class="bands">${bands}</div><div class="tiles">${tiles}</div></section>`;
  }).join("");
  const effBand = band(p.eff);
  return `<div class="screen">${header(view, now, { top: "SMART PRODUCTION CENTER", bottom: "DAILY PRODUCTION · " + PLANT.name.toUpperCase() + " (" + PLANT.code + ") · ALL CELLS" }, opts.sample)}
  <main class="plant">
    <div class="kpis">
      <div class="kpi"><div class="kv t-${effBand}">${pct(p.eff)}</div><div><div class="kl">PLANT TO GOAL</div><div class="ks">Earned ÷ paid hours, all cells</div></div></div>
      <div class="kpi"><div class="kv">${pct(p.adherence)}</div><div><div class="kl">SCHEDULE</div><div class="ks">Avg adherence · ${pct(view.shift.running ? Math.round(view.shift.fraction * 100) : 100)} expected by now</div></div></div>
      <div class="kpi"><div class="kv">${p.ops}</div><div><div class="kl">OPERATORS</div><div class="ks">This shift, all cells</div></div></div>
      <div class="kpi"><div class="kv t-behind">${p.downtime}</div><div><div class="kl">MIN DOWNTIME</div><div class="ks">This shift, all cells</div></div></div>
      <div class="kpi ${p.noStd ? "kpi-red" : ""}"><div class="kv ${p.noStd ? "t-off" : ""}">${p.noStd}</div><div><div class="kl">NO STANDARD</div><div class="ks">${p.noStd ? esc(p.noStdCells.join(", ")) + " · update Epicor" : "Every part has a standard"}</div></div></div>
    </div>${rowsHtml}
  </main>${opts.alert ? `<div class="alert">${esc(opts.alert)}</div>` : ""}</div>`;
}

export function renderCell(view, name, now, opts = {}) {
  const t = view.tiles.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (!t) return `<div class="screen"><div class="waiting">Unknown cell "${esc(name)}"</div></div>`;
  const m = t.m;
  const b = m && m.eff !== null ? band(m.eff) : "none";
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
      <span class="pf">${p.forecast === null ? "—" : p.forecast}</span><span class="pa">${p.actual === null ? "—" : p.actual}</span>
      <span class="pbar"><i class="bg-${pb}" style="width:${done === null ? 0 : Math.min(Math.round(done * 100), 100)}%"></i></span>
      <span class="ps ${ok ? "" : "t-off"}">${ok ? +p.std.toFixed(2) : "NO STD"}</span><span class="ps ${ok ? "" : "t-off"}">${ok ? p.crew : "—"}</span>
      <span class="pst t-${done === null ? (ok ? "none" : "off") : pb}">${done === null ? (ok ? "EXTRA" : "CHECK") : Math.round(done * 100) + "%"}</span></div>`;
  }).join("");
  const hist = t.history.map((h) => `<div class="hcol"><span class="t-${band(h.eff)}">${h.eff}%</span><i class="bg-${band(h.eff)}" style="height:${Math.round(Math.min(h.eff, 115) * 1.05)}px;opacity:${h.now ? 1 : 0.75}"></i><em>${h.now ? "NOW" : esc(h.day + " " + h.shift)}</em></div>`).join("");
  const flag = m && m.noStd.length ? `<div class="flagbar">${m.noStd.length} part${m.noStd.length > 1 ? "s" : ""} made this shift ${m.noStd.length > 1 ? "have" : "has"} no ${esc(t.rg)} standard in Epicor (${esc(m.noStd.join(", "))}). Not counted in the goal: add ${m.noStd.length > 1 ? "them" : "it"} in Epicor.</div>` : "";
  const deg = m && m.eff !== null ? Math.round(Math.min(m.eff, 100) * 3.6) : 0;
  return `<div class="screen">${header(view, now, { top: t.name.toUpperCase(), bottom: PLANT.name.toUpperCase() + " (" + PLANT.code + ") · RESOURCE GROUP " + (t.rg || "?") }, opts.sample)}
  <main class="cell">
    <section class="cleft b-${b}">
      <div class="ringrow"><div class="ring" style="background:conic-gradient(var(--${b}) ${deg}deg,#E2E8F0 0)"><div><b class="t-${b}">${pct(m ? m.eff : null)}</b><span>TO GOAL</span></div></div>
        <div class="ringside"><span class="chip c-${b}">${LABEL[b]}</span><div class="muted">${m && m.paid ? m.earned.toFixed(1) + " standard hours earned in " + m.paid.toFixed(1) + " hours worked (" + m.ops + " operators)" : "Enter # of operators and hours to get % to goal"}</div></div></div>
      <div class="box"><div class="bl">UPLH THIS SHIFT</div><div class="bv"><b>${fix1(m ? m.uplh : null)}</b><span class="t-on">/ ${fix1(m ? m.goal : null)}</span><em class="t-on">UPLH GOAL · FROM EPICOR</em></div></div>
      <div class="box"><div class="bl"><span>SCHEDULE</span><span>${pct(Math.round(fraction * 100))} EXPECTED BY NOW</span></div>
        <div class="bv"><b>${m ? m.schedMade : 0}</b><span>/ ${m ? m.forecast : 0} PCS</span><span class="t-${b}">${pct(m ? m.adherence : null)}</span></div>
        <div class="bar"><i class="bg-${b}" style="width:${Math.min(m && m.adherence ? m.adherence : 0, 100)}%"></i></div></div>
      <div class="trio"><div class="box"><div class="bl">OPERATORS</div><div class="tv"><b>${m ? m.ops : 0}</b></div></div>
        <div class="box"><div class="bl">HOURS WORKED</div><div class="tv"><b>${(view.shift.hoursDone || 0).toFixed(1)}</b><span>/ ${t.block && t.block.hours ? t.block.hours : PLANT.shifts[view.shift.shift].hours}</span></div></div>
        <div class="box warm"><div class="bl">DOWNTIME</div><div class="tv"><b class="t-behind">${m ? m.downtime : 0}</b><span>min</span></div></div></div>
    </section>
    <section class="cright">
      <div class="parts"><div class="ph">PARTS THIS SHIFT</div>
        <div class="phead"><span>PART #</span><span>DESCRIPTION (EPICOR)</span><span>FORECAST</span><span>ACTUAL</span><span>PROGRESS</span><span>STD /HR</span><span>CREW</span><span>STATUS</span></div>
        ${rows || '<div class="muted pad">Nothing entered for this shift yet.</div>'}<div class="grow"></div>${flag}</div>
      <div class="hist"><div class="hh"><b>LAST SHIFTS · TO GOAL</b><span>From this week's and last week's tabs</span></div><div class="hcols">${hist}</div></div>
    </section>
  </main>${opts.alert ? `<div class="alert">${esc(opts.alert)}</div>` : ""}</div>`;
}
