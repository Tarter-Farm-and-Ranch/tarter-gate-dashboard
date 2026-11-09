// Preview data (?preview=1): real Epicor parts, standards and crews, made-up pieces.
// Shaped exactly like what the source PC publishes, and built for "now", so the preview
// looks live at any hour.

var Gate = Gate || {};

(function (G) {

// cell: [rg, operators, [[part, desc, forecast, std, crew], ...scheduled], [part, desc, std, crew] extra, pace, downtime]
const CELLS = {
  "TK1": ["LRC2", 1, [["1002767", "Panel 1, Panel 5x6 Frame Weldment", 378, 80, 1], ["1002760", "Panel 3, Door Panel 5x6 Frame Weldment", 269, 57, 1]], ["1002763", "Panel 2, Door Frame Weldment", 72, 1], 0.92, 10],
  "TK2": ["LRC1", 2, [["1002767", "Panel 1, Panel 5x6 Frame Weldment", 240, 50.75, 2], ["1002760", "Panel 3, Door Panel 5x6 Frame Weldment", 109, 23, 2]], ["1002763", "Panel 2, Door Frame Weldment", 18.5, 2], 1.04, 0],
  "Manual Weld": ["GWLDPL2", 6, [["1001221", "4' COMBO WALK THRU WELD", 212, 14.93, 2], ["1001277", "6' Tall x 10' Long Cattle Panel Weldment", 128, 9.01, 2]], ["1001220", "RRW64 WELD CODE", 14.93, 2], 0.86, 15],
  "K9": ["PL3 WELD", 4, [["DK10FF", "WELD 10' DOG KENNEL FRONT FRAME", 99, 10.53, 2], ["DK5SF", "WELD DOG KENNEL 5' SIDE FRAME", 210, 22.22, 2]], ["DK5FF", "WELD 5' DOG KENNEL FRONT FRAME", 10.53, 2], 0.58, 40],
  "AMI": ["PL3 RW", 3, [["DK5F", "WELD 5' DOG KENNEL FRONT", 404, 85.5, 3], ["DK10F", "WELD 10' DOG KENNEL FRONT", 157, 33.3, 3]], ["1002050", "Welded Wire Gate - 3' Round Corner", 111, 5], 0.83, 5],
  "AWL1": ["RGCP", 2, [["1001757", "6-BAR GATE - 12' Resistance Welded", 340, 72, 2], ["1001754", "6-BAR GATE - 6' Resistance Welded", 340, 72, 2]], ["1001285", "Bextra HD Section Weldment", 0, 0], 0.97, 20],
  "AWL2": ["RGCP", 2, [["1001755", "6-BAR GATE - 8' Resistance Welded", 340, 72, 2], ["1001753", "6-BAR GATE - 4' Resistance Welded", 340, 72, 2]], ["1001758", "6-BAR GATE - 14' Resistance Welded", 72, 2], 0.71, 45],
  "E-Coat": ["PAINTPL2", 13, [["1001353", "4' economy gate e-coat blue", 1994, 422, 13], ["1001354", "6' economy gate e-coat blue", 1994, 422, 13]], ["1001255", "Painted stationary panel small bale feeder", 482, 13], 0.95, 0],
  "Powder Coat": ["PAINTPCL", 10, [["2000714P", "6' Commercial Temporary Fence Panel", 673, 142.5, 10], ["1001254", "Painted attachment rod 42\"", 1418, 300, 10]], ["2000714CP", "6' Commercial Temporary Fence Panel", 142.5, 10], 0.8, 30],
  "Gate Line": ["GLWDCON", 4, [["2C12", "2\" CORRAL 12' WELD ASSY", 108, 11.46, 2], ["2G10", "2\" 10' WELD GATE", 147, 15.56, 2]], ["2C10", "2\" CORRAL 10' WELD ASSY", 11.46, 2], 0.9, 12],
  "Feeder Shop": ["FWELDPL2", 4, [["1001285", "Bextra HD Section Weldment", 69, 7.27, 2], ["1001281", "HD Cattle Handling Bow Only Weldment", 74, 7.88, 2]], ["1001227", "GMF Hood Base", 34.28, 2], 0.66, 20],
  "Cattle": ["CATWELD", 3, [["1000366", "Welded Series 3 Auto Headgate LH Outer Door", 129, 9.09, 1], ["1000367", "Welded Series 3 Auto Headgate RH Outer Door", 129, 9.09, 1]], ["Z3815", "", 0, 0], 0.88, 0],
  "Assembly": ["ASSYPL2", 10, [["1001273", "Bextra Light Section Weldment", 142, 30, 10], ["1PB5", "TITAN POLY BUNK FEEDER-HD 5'", 58, 12.22, 10]], ["1PEB10", "POLY BUNK FEEDER-1 PC ECON 10'", 14.44, 1], 1.01, 0]
};

function block([, ops, sched, extra, pace, downtime], fraction, hours, wobble) {
  const p = pace * wobble;
  const parts = sched.map(([part, desc, forecast, std, crew]) => ({ part, desc, forecast, std, crew, sched: true, actual: Math.round(forecast * p * fraction) }));
  parts.push({ part: extra[0], desc: extra[1], forecast: null, std: extra[2], crew: extra[3], sched: false, actual: Math.max(1, Math.round(12 * fraction)) });
  return { ops, hours, downtime: Math.round(downtime * fraction), parts };
}

G.sampleData = function (now) {
  const clock = G.plantClock(now || new Date());
  const shift = G.currentShift(clock);
  const cells = {};
  let i = 0;
  for (const [name, spec] of Object.entries(CELLS)) {
    i++;
    const weeks = {};
    const put = (dayISO, key, fraction, hours, wobble) => {
      const w = G.mondayOf(dayISO);
      (weeks[w] = weeks[w] || {})[key] = block(spec, fraction, hours, wobble);
    };
    // The running shift, then the 7 shifts before it (two per weekday, one on weekend days).
    put(shift.dayISO, shift.key, shift.fraction, shift.hours, 1);
    let n = 0;
    for (let back = 0; back < 7 && n < 7; back++) {
      const dayISO = G.addDays(shift.dayISO, -back);
      const dayIndex = (shift.dayIndex - back + 70) % 7;
      const list = dayIndex <= 4 ? ["2nd", "1st"] : ["wknd"];
      for (const s of list) {
        if (back === 0 && (s === shift.shift || (shift.shift === "1st" && s === "2nd"))) continue;
        if (dayIndex >= 5 && !name.startsWith("AWL")) continue;
        const hours = s === "2nd" ? 9.5 : s === "wknd" ? 12.5 : 10.5;
        put(dayISO, dayIndex + "-" + s, 1, hours, 0.85 + ((i * 7 + n * 13) % 30) / 100);
        n++;
      }
    }
    if (name === "TK1" || name === "E-Coat") {
      const b = weeks[G.mondayOf(shift.dayISO)][shift.key];
      b.parts[1] = Object.assign({}, b.parts[1], { actual: null, comment: name === "TK1" ? "Waiting on material" : "Line down 20 min, chain" });
    }
    cells[name] = { rg: spec[0], site: "MfgSys", title: name, weeks, warnings: [], savedAt: new Date((now || new Date()).getTime() - (2 + i * 3) * 60e3).toISOString() };
  }
  for (const name of Object.keys(cells)) {
    const b = cells[name].weeks[G.mondayOf(shift.dayISO)][shift.key];
    if (b) b.nowPart = b.parts[0].part;
  }
  const last = G.addDays(clock.iso, -124);
  return { cells, expected: { TK1: 2, TK2: 2, "Manual Weld": 6, K9: 4 }, safety: { lastRecordable: last, topic: "Ladder Safety" } };
};
})(Gate);
