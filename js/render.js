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

  /** "SAVED 11:58 AM" (today, plant time) or "SAVED 11/4" (an older save): when the cell's workbook was last saved. */
  G.savedText = function (iso, now) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const tz = PLANT.timeZone;
    const day = (d) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric", day: "numeric" }).format(d);
    const today = day(now || new Date()) === day(new Date(t));
    return "SAVED " + (today ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(t)) : day(new Date(t)));
  };
  const saved = (t, now) => (t.savedAt ? `<span class="c-saved">${esc(G.savedText(t.savedAt, now))}</span>` : "");

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
    ${opts.alert ? '<div class="sysact sys-warn"><i></i>CHECK DATA FEED</div>' : '<div class="sysact"><i></i>SYSTEM ACTIVE</div>'}
    ${opts.sample ? '<div class="chip-sample">SAMPLE DATA · PREVIEW</div>' : ""}
    ${shiftBlock}
    <div class="clock"><div class="c1" data-clock>${esc(c.time)}</div><div class="c2" data-date>${esc(c.date)}</div></div>
  </header>`;
  }

  function kpi(num, title, sub, cls) {
    return `<div class="kpi ${cls || ""}"><div class="kv">${num}</div><div class="kt"><div class="kl">${title}</div><div class="ks">${sub}</div></div></div>`;
  }

  /** Green tile like West's: days since the last recordable and today's topic (Dashboard Settings, Safety tab). */
  function safetyKpi(view, now) {
    const sf = view.safety;
    if (!sf || (!sf.lastRecordable && !sf.topic)) return "";
    const today = Date.parse(view.clock.iso + "T00:00:00Z");
    const last = Date.parse(sf.lastRecordable + "T00:00:00Z");
    const days = Number.isFinite(last) ? Math.max(0, Math.round((today - last) / 864e5)) : null;
    return `<div class="kpi kpi-safe">${days === null ? "" : `<div class="kv">${days}</div><div class="kt"><div class="kl">DAYS WITHOUT<br>A RECORDABLE</div></div>`}${sf.topic ? `<div class="topic"><span>TODAY'S TOPIC</span><b>${esc(sf.topic)}</b></div>` : ""}</div>`;
  }

  /** OPERATORS, or PERSONNEL present / expected when Dashboard Settings has EXPECTED OPERATORS. */
  function personnelKpi(view, cellsLine) {
    const shown = view.tiles.filter((t) => t.shown);
    const withExp = shown.filter((t) => view.expected[t.name] > 0);
    const ops = shown.reduce((n, t) => n + (t.m ? t.m.ops : 0), 0);
    if (!withExp.length) return kpi(int(ops), "OPERATORS", `This shift<br>${esc(cellsLine)}`);
    const exp = withExp.reduce((n, t) => n + view.expected[t.name], 0);
    const short = withExp.filter((t) => t.m && t.m.ops < view.expected[t.name]).map((t) => esc(t.name) + ": " + (view.expected[t.name] - t.m.ops) + " missing");
    return kpi(`<span class="${ops < exp ? "t-off" : ""}">${int(ops)}</span><small class="of">/${int(exp)}</small>`, "PERSONNEL",
      `Present / expected<br>${short.length ? `<b class="t-off">${short.slice(0, 2).join(" · ")}</b>` : "Every cell staffed"}`);
  }

  function shiftLeftKpi(view) {
    const s = view.shift;
    if (!s.running) return kpi("ENDED", esc(s.label), hhmm(s.start) + " – " + hhmm(s.start + s.minutes), "kpi-dark");
    const sub = hhmm(s.start) + " – " + hhmm(s.start + s.minutes);
    const h = Math.floor(s.minutesLeft / 60), m = Math.round(s.minutesLeft % 60);
    return kpi(h ? `${h}h ${m}m` : `${m}m`, esc(s.label) + " LEFT", sub, "kpi-dark");
  }

  // size: "big" (4 cells or fewer), "mid" (5-7 cells, one row) or "" (two rows).
  function tile(t, view, size) {
    const m = t.m;
    const big = size === "big", mid = size === "mid";
    const rs = big ? 92 : mid ? 96 : 66;
    if (!t.hasFile || !m) {
      return `<div class="card tb-none">
      <div class="c-top"><div class="c-name">${esc(t.name)}</div></div>
      <div class="c-meta"><span class="c-rg">${esc(t.rg)}</span>${saved(t, view.now)}</div>
      <div class="c-empty"><b>${t.hasFile ? "NOTHING ENTERED" : "NO FILE YET"}</b><span>${t.hasFile ? "for " + esc(view.shift.label.toLowerCase()) : "No " + esc(t.name) + " workbook in the folder"}</span></div></div>`;
    }
    const b = band(m.eff);
    const sb = band(m.schedPace);
    const uplhPct = has(m.uplh) && m.goal ? Math.min(100, m.uplh / m.goal * 100) : 0;
    const prev = t.history.filter((h) => !h.now).slice(-1)[0];
    const notes = [];
    if (m.noStd.length) notes.push(`<div class="note n-red"><b>${big || mid ? m.noStd.length + " PART" + (m.noStd.length > 1 ? "S" : "") + " · NO STANDARD" : "NO STD · " + m.noStd.length + " PART" + (m.noStd.length > 1 ? "S" : "")}</b><span>for ${esc(t.rg)} · add in Epicor</span></div>`);
    if (!m.ops) notes.push(`<div class="note n-amber"><b>ENTER # OF OPERATORS</b><span>to get % to goal</span></div>`);
    else if (m.downtime && !big) notes.push(`<div class="note n-amber"><b>DOWNTIME · ${int(m.downtime)} MIN</b></div>`);
    const comments = t.block ? t.block.parts.filter((p) => p.comment) : [];
    let commentsBox = "";
    if (big || mid) {
      const lines = comments.slice(0, big ? 3 : 2).map((p) => `<div class="cm-l"><b>${esc(p.part)}</b><span>${esc(p.comment)}</span></div>`).join("");
      const more = comments.length - (big ? 3 : 2);
      if (mid && !comments.length) commentsBox = "";
      else commentsBox = `<div class="cmts${comments.length ? "" : " cmts-empty"}"><div class="cm-h">${mid ? "COMMENTS" : "COMMENTS · " + esc(view.shift.label)}</div>${lines || '<div class="cm-none">No comments. Type text in ACTUAL (e.g. "waiting on material") and it shows here.</div>'}${more > 0 ? `<div class="cm-more">+${more} more</div>` : ""}</div>`;
    } else if (comments.length) {
      notes.push(`<div class="note n-blue"><b>${comments.length} COMMENT${comments.length > 1 ? "S" : ""}</b><span>${esc(comments[0].part + ": " + comments[0].comment)}</span></div>`);
    }
    const extra = m.made - m.schedMade;
    return `<div class="card tb-${b}">
    <div class="c-top"><div class="c-name">${esc(t.name)}</div></div>
    <div class="c-meta"><span class="pill${view.expected[t.name] > m.ops ? " pill-short" : ""}">${PERSON}${int(m.ops)}${view.expected[t.name] ? `<small>/${int(view.expected[t.name])}</small>` : ""}</span>${mid ? "" : `<span class="c-rg">${esc(t.rg)}</span>`}${big || mid ? saved(t, view.now) : ""}<span class="grow"></span>${SHORT_CHIP[b] ? `<span class="chip ch-${b}">${mid ? SHORT_CHIP[b].split(" ")[0] : SHORT_CHIP[b]}</span>` : ""}</div>
    <div class="hero h-${b}">
      <div class="h-l">UPLH THIS SHIFT</div>
      <div class="h-v"><b>${fix1(m.uplh)}</b><span>/ ${fix1(m.goal)} <em>GOAL</em></span></div>
      <div class="track"><i class="bg-${b === "none" ? "none" : b} stripes" style="width:${uplhPct.toFixed(0)}%"></i></div>
    </div>
    <div class="rings">
      <div class="rc">${ring(m.adherence, rs, COLOR[sb])}<div class="rl">SCHED.${mid ? " " : "<br>"}DONE</div></div>
      <div class="rdiv"></div>
      <div class="rc">${ring(m.eff, rs, COLOR[b])}<div class="rl">TO${mid ? " " : "<br>"}GOAL</div></div>
    </div>
    <div class="duo${big ? " trio3" : ""}"><div class="mini"><div class="ml">ACTUAL</div><div class="mv">${int(m.schedMade)}</div></div><div class="mini"><div class="ml">SCHEDULED</div><div class="mv">${int(m.forecast)}</div></div>${big ? `<div class="mini ${m.downtime ? "m-amber" : ""}"><div class="ml">DOWNTIME</div><div class="mv">${int(m.downtime)}<small>min</small></div></div>` : ""}</div>
    ${notes.length || big ? "" : `<div class="c-sub">${extra > 0 ? "+" + int(extra) + " pcs not on schedule" : ""}</div>`}
    ${big ? paceRow(m, view) : ""}
    ${big || mid ? partsList(t.block, view, mid) : ""}
    <div class="grow"></div>
    ${commentsBox}
    ${mid && !comments.length ? histStrip(t, 4) : ""}
    ${notes.slice(0, big || mid ? 2 : 1).join("")}
    ${big || mid || m.noStd.length ? "" : `<div class="c-last">${prev ? "Last shift " + esc(prev.day + " " + prev.shift) + ": <b class=\"t-" + band(prev.eff) + "\">" + prev.eff + "%</b>" : "&nbsp;"}</div>`}
  </div>`;
  }

  /** Big cards (few cells on screen): the parts this shift, schedule first. */
  /** Big and medium cards: the cell's last shifts, % to goal, as compact chips ("now" last). */
  function histStrip(t, count) {
    const h = t.history.slice(-count);
    if (h.length < 2) return "";
    const chips = h.map((x) => `<span class="hc${x.now ? " hc-now" : ""}"><em>${x.now ? "NOW" : esc(x.day + " " + x.shift)}</em><b class="t-${band(x.eff)}">${x.eff}%</b></span>`).join("");
    return `<div class="hstrip"><div class="pl-h"><span>LAST SHIFTS · TO GOAL</span></div><div class="hchips">${chips}</div></div>`;
  }

  /**
   * Big cards: where the shift is heading. At this pace = scheduled pieces made ÷ part of
   * the shift worked; needed /hr = pieces still to make ÷ hours left.
   */
  function paceRow(m, view) {
    const s = view.shift;
    if (!m || !m.forecast) return "";
    const left = Math.max(0, m.forecast - m.schedMade);
    let proj = "--", projB = "none", need = "--", needSub = "";
    if (!s.running) { proj = int(m.schedMade); projB = band(m.adherence); need = left ? int(left) : "✓"; needSub = left ? "pcs short" : "schedule met"; }
    else {
      if (s.fraction > 0.05) { const p = Math.round(m.schedMade / s.fraction); proj = int(p); projB = band(Math.round(p / m.forecast * 100)); }
      if (!left) { need = "✓"; needSub = "schedule met"; }
      else if (s.minutesLeft > 0) { need = int(Math.ceil(left / (s.minutesLeft / 60))); needSub = int(left) + " pcs to go"; }
    }
    return `<div class="pace">
      <div class="pc"><div class="ml">${s.running ? "AT THIS PACE" : "SHIFT ENDED AT"}</div><div class="mv t-${projB}">${proj}<small>/ ${int(m.forecast)}</small></div><div class="ps">${s.running ? "by " + hhmm(s.start + s.minutes) : "scheduled pieces"}</div></div>
      <div class="pc"><div class="ml">${s.running ? "NEEDED / HR" : "LEFT"}</div><div class="mv">${need}</div><div class="ps">${needSub}</div></div>
    </div>`;
  }

  // Parts without a standard are counted in the red note, not listed, so a long list of
  // them can't push the card off the screen; the rest are cut at what fits, with "+N more".
  const BIG_CARD_PARTS = 3;
  const MID_CARD_PARTS = 6;
  function partsList(block, view, compact) {
    const all = block ? block.parts.filter((p) => p.std > 0 && p.crew > 0) : [];
    if (!all.length) return "";
    const parts = all.slice(0, compact ? MID_CARD_PARTS : BIG_CARD_PARTS);
    const more = all.length - parts.length;
    const fraction = view.shift.running ? view.shift.fraction : 1;
    const rows = parts.map((p) => {
      const ok = p.std > 0 && p.crew > 0;
      const done = p.forecast ? (p.actual || 0) / p.forecast : null;
      const pb = done === null ? "none" : band(fraction ? Math.round(done / fraction * 100) : 0);
      if (compact) {
        return `<div class="pl-row pl-c${block.nowPart === p.part ? " pl-now" : ""}"><span class="pl-n">${block.nowPart === p.part ? '<em class="nowb">▶</em>' : ""}${esc(p.part)}</span><span class="pl-v">${p.actual === null ? "—" : int(p.actual)}<small>/ ${p.forecast === null ? "extra" : int(p.forecast)}</small></span>
        <span class="ptrack"><i class="bg-${pb} stripes" style="width:${done === null ? 0 : Math.min(Math.round(done * 100), 100)}%"></i></span></div>`;
      }
      const now = block.nowPart === p.part;
      return `<div class="pl-row ${ok ? "" : "pl-red"}${now ? " pl-now" : ""}"><span class="pl-n">${now ? '<em class="nowb">▶ NOW</em>' : ""}${esc(p.part)}</span><span class="pl-d">${esc(p.desc || (ok ? "" : "No standard in Epicor"))}</span>
        <span class="pl-v">${p.actual === null ? "—" : int(p.actual)}<small>/ ${p.forecast === null ? "extra" : int(p.forecast)}</small></span>
        <span class="ptrack"><i class="bg-${pb} stripes" style="width:${done === null ? 0 : Math.min(Math.round(done * 100), 100)}%"></i></span></div>`;
    }).join("");
    return `<div class="plist"><div class="pl-h"><span>PARTS · ${esc(view.shift.label)}${view.shift.running ? "" : " (ENDED)"}</span>${compact ? "" : "<span>ACTUAL / FORECAST</span>"}</div>${rows}${more > 0 ? `<div class="pl-more">+${more} more part${more > 1 ? "s" : ""}</div>` : ""}</div>`;
  }

  G.renderPlant = function (view, now, opts) {
    opts = opts || {};
    const p = view.plant;
    const shownAreas = view.shownAreas || G.shownAreas();
    const shownCount = shownAreas.reduce((n, a) => n + a.cells.length, 0);
    // 4 cells or fewer (the rollout starts with TK1 and TK2): one row of big cards;
    // 5 to 7: one row of medium cards; more: rows of 7 small cards.
    const few = shownCount <= 4;
    const mid = !few && shownCount <= 7;
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
    // Cell names: big with few cards across, smaller as more cards share the row.
    const nameSize = (across) => ({ 1: 68, 2: 56, 3: 50, 4: 46, 5: 42, 6: 36, 7: 32 })[across] || 26;
    const oneRow = (size) => {
      // One row: no legend card (it left a mostly empty column); the colors go in a line
      // at the end of the area titles.
      // Big cards stay a bit narrower than the screen allows, centred: easier to read.
      const cols = size === "big" ? `grid-template-columns:repeat(${shownCount}, minmax(0, ${shownCount === 1 ? 1000 : shownCount === 2 ? 800 : 1000}px));justify-content:center;column-gap:40px` : `grid-template-columns:repeat(${shownCount}, minmax(0, 1fr))`;
      const bands = shownAreas.map((a) => `<div class="band" style="grid-column:span ${a.cells.length}"><b>${esc(a.name)}</b><span>${a.cells.length} cell${a.cells.length > 1 ? "s" : ""} · ${areaAvg(a.cells)}</span></div>`).join("");
      const tiles = shownAreas.reduce((all, a) => all.concat(a.cells), []).map((n) => tile(view.tiles.find((t) => t.name === n), view, size)).join("");
      return `<section class="arow ${size === "big" ? "few" : "mid"}" style="--cn:${nameSize(shownCount)}px"><div class="bands" style="${cols}">${bands}</div><div class="tiles" style="${cols}">${tiles}</div></section>`;
    };
    // 8 cells or more: two rows, the cells split evenly (10 -> 5 + 5, 13 -> 7 + 6), so no
    // row ends with holes. An area that runs across both rows gets its band in each.
    const twoRows = () => {
      const order = shownAreas.reduce((all, a) => all.concat(a.cells.map((c) => ({ cell: c, area: a.name }))), []);
      const cols = Math.ceil(order.length / 2);
      const shown = {};
      return [order.slice(0, cols), order.slice(cols)].map((row) => {
        const runs = [];
        for (const it of row) {
          const last = runs[runs.length - 1];
          if (last && last.area === it.area) last.cells.push(it.cell);
          else runs.push({ area: it.area, cells: [it.cell] });
        }
        const gap = cols - row.length;
        const bands = runs.map((r) => {
          const all = shownAreas.find((a) => a.name === r.area).cells;
          const label = shown[r.area] ? "" : `<span>${all.length} cell${all.length > 1 ? "s" : ""} · ${areaAvg(all)}</span>`;
          shown[r.area] = true;
          return `<div class="band" style="grid-column:span ${r.cells.length}"><b>${esc(r.area)}</b>${label}</div>`;
        }).join("") + (gap ? `<div style="grid-column:span ${gap}"></div>` : "");
        const tiles = row.map((it) => tile(view.tiles.find((t) => t.name === it.cell), view)).join("") + (gap ? legend : "");
        const style = `grid-template-columns:repeat(${cols}, minmax(0, 1fr))`;
        return `<section class="arow" style="--cn:${nameSize(cols)}px"><div class="bands" style="${style}">${bands}</div><div class="tiles" style="${style}">${tiles}</div></section>`;
      }).join("");
    };
    const rowsHtml = few ? oneRow("big") : mid ? oneRow("mid") : twoRows();
    const effBand = band(p.eff);
    const total = p.cellsShown;
    // Like West's row: the number, a title and two short lines under it.
    const withEff = view.tiles.filter((t) => t.shown && t.m && has(t.m.eff));
    const lowest = withEff.slice().sort((a, b) => a.m.eff - b.m.eff)[0];
    const cellsLine = few ? shownAreas.reduce((all, a) => all.concat(a.cells), []).join(", ") : p.cellsShown + " cells";
    const kpis = safetyKpi(view, now) + kpi(`<span class="t-${effBand}">${has(p.eff) ? p.eff + "<small>%</small>" : "--"}</span>`, "PLANT TO GOAL",
        `${p.cellsWithData} of ${total} cells reporting` + (lowest && withEff.length > 1 ? `<br>Lowest: ${esc(lowest.name)} <b class="t-${band(lowest.m.eff)}">${lowest.m.eff}%</b>` : ""))
      + kpi(has(p.adherence) ? p.adherence + "<small>%</small>" : "--", "SCHEDULE DONE", `Avg of ${cellsLine}<br>${view.shift.running ? Math.round(view.shift.fraction * 100) : 100}% expected by now`)
      + personnelKpi(view, cellsLine)
      + shiftLeftKpi(view);
    return `<div class="screen">${header(view, now, { top: "SMART PRODUCTION CENTER", bottom: "DAILY PRODUCTION DASHBOARD · " + PLANT.name.toUpperCase().replace(/^TARTER /, "") }, opts)}
  <main class="plant"><div class="kpis${view.safety && (view.safety.lastRecordable || view.safety.topic) ? " kpis5" : ""}">${kpis}</div>${rowsHtml}</main>${opts.alert ? `<div class="alert">${esc(opts.alert)}</div>` : ""}</div>`;
  };

  G.renderCell = function (view, name, now, opts) {
    opts = opts || {};
    const t = view.tiles.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!t) return `<div class="screen"><div class="waiting">Unknown cell "${esc(name)}"</div></div>`;
    const m = t.m;
    const b = m ? band(m.eff) : "none";
    const sb = m ? band(m.schedPace) : "none";
    const fraction = view.shift.running ? view.shift.fraction : 1;
    // About 11 rows fit; the rest are summed up as "+N more parts".
    const CELL_ROWS = m && m.noStd.length ? 10 : 11;
    const allParts = t.block ? t.block.parts : [];
    const parts = allParts.slice(0, CELL_ROWS);
    const moreParts = allParts.length - parts.length;
    let lineDone = false;
    const rows = parts.map((p) => {
      let pre = "";
      if (!p.sched && !lineDone) { pre = `<div class="pline">NOT SCHEDULED · MADE THIS SHIFT</div>`; lineDone = true; }
      const ok = p.std > 0 && p.crew > 0;
      const done = p.forecast ? (p.actual || 0) / p.forecast : null;
      const pb = done === null ? "none" : band(fraction ? Math.round(done / fraction * 100) : 0);
      return pre + `<div class="prow ${ok ? "" : "prow-red"}">
      <span class="pn">${t.block && t.block.nowPart === p.part ? '<em class="nowb">▶ NOW</em>' : ""}${esc(p.part)}</span><span class="pd">${p.comment ? `<i class="pcm">💬 ${esc(p.comment)}</i>` : esc(p.desc)}</span>
      <span class="pf">${p.forecast === null ? "—" : int(p.forecast)}</span><span class="pa">${p.actual === null ? "—" : int(p.actual)}</span>
      <span class="ptrack"><i class="bg-${pb} stripes" style="width:${done === null ? 0 : Math.min(Math.round(done * 100), 100)}%"></i></span>
      <span class="ps ${ok ? "" : "t-off"}">${ok ? +p.std.toFixed(2) : "NO STD"}</span><span class="ps ${ok ? "" : "t-off"}">${ok ? p.crew : "—"}</span>
      <span class="pst t-${done === null ? (ok ? "none" : "off") : pb}">${done === null ? (ok ? "EXTRA" : "CHECK") : Math.round(done * 100) + "%"}</span></div>`;
    }).join("");
    const hist = t.history.map((h) => `<div class="hcol"><span class="t-${band(h.eff)}">${h.eff}%</span><i class="bg-${band(h.eff)}${h.now ? " stripes" : ""}" style="height:${Math.round(Math.min(h.eff, 115) * 1.05)}px;opacity:${h.now ? 1 : 0.75}"></i><em>${h.now ? "NOW" : esc(h.day + " " + h.shift)}</em></div>`).join("");
    const listed = m ? m.noStd.slice(0, 4).join(", ") + (m.noStd.length > 4 ? " and " + (m.noStd.length - 4) + " more" : "") : "";
    const flag = m && m.noStd.length ? `<div class="note n-red wide"><b>${m.noStd.length} PART${m.noStd.length > 1 ? "S" : ""} WITH NO ${esc(t.rg)} STANDARD IN EPICOR</b><span>${esc(listed)} · not counted in the goal: add ${m.noStd.length > 1 ? "them" : "it"} in Epicor</span></div>` : "";
    const uplhPct = m && has(m.uplh) && m.goal ? Math.min(100, m.uplh / m.goal * 100) : 0;
    const hoursPlan = t.block && t.block.hours ? t.block.hours : PLANT.shifts[view.shift.shift].hours;
    return `<div class="screen">${header(view, now, { top: t.name.toUpperCase() + (t.rg ? " · " + t.rg : ""), bottom: "DAILY PRODUCTION DASHBOARD · " + PLANT.name.toUpperCase().replace(/^TARTER /, "") }, Object.assign({ shiftInHeader: true }, opts))}
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
      <div class="card parts"><div class="ph">PARTS · ${esc(view.shift.label)} · ${hhmm(view.shift.start)} – ${hhmm(view.shift.start + view.shift.minutes)}${view.shift.running ? "" : " (ENDED)"}</div>
        <div class="phead"><span>PART #</span><span>DESCRIPTION (EPICOR)</span><span>FORECAST</span><span>ACTUAL</span><span>PROGRESS</span><span>STD /HR</span><span>CREW</span><span>STATUS</span></div>
        ${rows || '<div class="muted pad">Nothing entered for this shift yet.</div>'}${moreParts > 0 ? `<div class="pl-more">+${moreParts} more part${moreParts > 1 ? "s" : ""} in the workbook</div>` : ""}<div class="grow"></div>${flag}</div>
      <div class="card hist"><div class="hh"><b>LAST SHIFTS · TO GOAL</b><span>From this week's and last week's tabs</span></div><div class="hcols">${hist}</div></div>
    </section>
  </main>${opts.alert ? `<div class="alert">${esc(opts.alert)}</div>` : ""}</div>`;
  };

  G.renderWaiting = function (now, text, opts) {
    const fake = { shift: { label: "", start: 0, minutes: 0, running: false } };
    return `<div class="screen">${header(fake, now, { top: "SMART PRODUCTION CENTER", bottom: "DAILY PRODUCTION DASHBOARD · " + PLANT.name.toUpperCase().replace(/^TARTER /, "") }, opts || {})}<div class="waiting">${esc(text)}</div></div>`;
  };
})(Gate);
