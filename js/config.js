// Plant settings: the only file that changes from one plant to another.
// Cells are found by file name: "<cell> Weekly Production.xlsx" in the connected folder.

export const PLANT = {
  name: "Tarter Gate",
  code: "TGC",
  // Epicor site used to look up standards (cell E1 in every workbook says the same).
  site: "MfgSys",
  // Every screen shows plant wall-clock time, whatever zone its device is set to.
  timeZone: "America/New_York",
  standardsFile: "Production Standards.xlsx",
  cellFilePattern: /^(.+?) Weekly Production\.xlsx$/i,
  // Shift windows in plant time. 2nd shift ends after midnight and belongs to the day it started.
  shifts: {
    "1st": { label: "1ST SHIFT", start: 6 * 60, minutes: 630, hours: 10.5 },
    "2nd": { label: "2ND SHIFT", start: 16 * 60 + 30, minutes: 570, hours: 9.5 },
    wknd: { label: "WEEKEND", start: 4 * 60, minutes: 750, hours: 12.5 }
  },
  areas: [
    { name: "WELD", cells: ["TK1", "TK2", "Manual Weld", "K9", "AMI", "AWL1", "AWL2"] },
    { name: "FINISH", cells: ["E-Coat", "Powder Coat"] },
    { name: "ASSEMBLY", cells: ["Gate Line", "Feeder Shop", "Cattle", "Assembly"] }
  ],
  // % to goal color bands, same as West: 80%+ on pace, 60-79% behind, under 60% off pace.
  bands: { on: 80, behind: 60 }
};

// Where things are in every weekly tab (the layout of Paul's Production Schedule Test,
// one block of 7 columns per day: A-G, I-O, Q-W, ...).
export const LAYOUT = {
  blockWidth: 8,
  topRow: 2, // Monday-Friday 1st shift, Saturday and Sunday weekend
  bottomRow: 35, // Monday-Friday 2nd shift
  valuesOffset: 2, // operators (B), hours (C), downtime (D)
  scheduledOffsets: [4, 17],
  unscheduledOffsets: [19, 27]
};

// Day 0 = Monday. Which block holds each day and shift.
export function blockPosition(dayIndex, shift) {
  if (shift === "2nd") return dayIndex <= 4 ? { top: LAYOUT.bottomRow, k: dayIndex } : null;
  if (shift === "1st") return dayIndex <= 4 ? { top: LAYOUT.topRow, k: dayIndex } : null;
  if (shift === "wknd") return dayIndex >= 5 ? { top: LAYOUT.topRow, k: dayIndex } : null;
  return null;
}

export function allCells() {
  return PLANT.areas.flatMap((a) => a.cells);
}
