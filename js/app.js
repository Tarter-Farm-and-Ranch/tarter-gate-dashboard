// Page logic. Three ways to open it:
//   /            source PC: connect the SharePoint folder (synced with OneDrive), read the
//                workbooks every 10 s and publish to the server
//   /tv          every TV / office PC: read what the source PC published (?cell=TK1 for one cell)
//   /preview     sample data, nothing read or published
// Plant screen by default; ?cell=<name> shows one cell.

import { PLANT, allCells } from "./config.js";
import { readStandards, readCellWorkbook } from "./reader.js";
import { buildView, plantClock, currentShift, mondayOf, addDays } from "./metrics.js";
import { renderPlant, renderCell } from "./render.js";
import { sampleData } from "./sample.js";

// Vercel rewrites keep the address bar as typed, so read the mode from the path too.
const params = new URLSearchParams(location.search);
const path = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
const MODE = params.get("preview") === "1" || path[0] === "preview" ? "preview" : params.get("tv") === "1" || path[0] === "tv" ? "tv" : "source";
const CELL = params.get("cell") || (path[0] === "tv" || path[0] === "preview" ? path[1] : null) || null;
const SOURCE_CHECK_MS = 10e3, TV_CHECK_MS = 15e3, HEARTBEAT_MS = 60e3;

const state = { data: null, feed: null, alert: "", lastOkFetch: Date.now(), status: "" };
const $ = (id) => document.getElementById(id);

// ---------- drawing ----------
function draw() {
  const now = new Date();
  const data = MODE === "preview" ? sampleData(now) : state.data;
  const root = $("root");
  if (!data) {
    root.innerHTML = `<div class="screen"><div class="waiting">${MODE === "source" ? "CONNECT THE PRODUCTION REPORTING FOLDER" : "WAITING FOR DATA"}</div></div>`;
  } else {
    const view = buildView(data, now);
    const opts = { sample: MODE === "preview", alert: state.alert };
    root.innerHTML = CELL ? renderCell(view, CELL, now, opts) : renderPlant(view, now, opts);
  }
  fit();
}
function fit() {
  const s = Number(params.get("scale")) || Math.min(innerWidth / 1920, innerHeight / 1080);
  const screen = document.querySelector(".screen");
  if (screen) screen.style.transform = `scale(${s})`;
}
addEventListener("resize", fit);

// ---------- TVs: read the published snapshot ----------
async function pullFeed() {
  try {
    const res = await fetch("/api/feed-snapshot", { cache: "no-store", signal: AbortSignal.timeout(20e3) });
    if (res.status === 404) { state.alert = "WAITING FOR THE SOURCE PC TO PUBLISH"; return; }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const feed = await res.json();
    state.data = feed.data;
    state.lastOkFetch = Date.now();
    const age = Date.parse(feed.serverTime) - Date.parse(feed.heartbeatAt);
    state.alert = age > 3 * 60e3 ? "SOURCE PC IS NOT SENDING · DATA FROM " + new Date(feed.heartbeatAt).toLocaleTimeString("en-US", { timeZone: PLANT.timeZone, hour: "numeric", minute: "2-digit" }) : "";
  } catch (err) {
    if (Date.now() - state.lastOkFetch > 15 * 60e3) state.alert = "NO CONNECTION TO SERVER";
  }
}

// ---------- source PC: read the folder ----------
const IDB = { name: "tarter-gate-dashboard", store: "handles" };
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB.name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB.store);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(IDB.store, mode);
      const req = fn(tx.objectStore(IDB.store));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const SKIP = /(^~\$)|( - copy)|(\(\d+\))|backup|\bold\b|-[a-z0-9-]*conflict/i;
async function listFiles(dir, depth = 0, out = []) {
  for await (const entry of dir.values()) {
    if (entry.kind === "file" && /\.xlsx$/i.test(entry.name) && !SKIP.test(entry.name)) out.push(entry);
    else if (entry.kind === "directory" && depth < 2 && !/^(archive|old|backup)$/i.test(entry.name)) await listFiles(entry, depth + 1, out);
  }
  return out;
}

const cache = { standards: null, standardsSig: "", cells: {}, dir: null, publishedBody: "", publishedAt: 0, changedAt: 0 };
async function readFolder() {
  const dir = cache.dir;
  if (!dir) return;
  if ((await dir.queryPermission({ mode: "read" })) !== "granted") { showReconnect(); return; }
  const entries = await listFiles(dir);
  const files = await Promise.all(entries.map(async (e) => ({ name: e.name, file: await e.getFile() })));
  const sig = (f) => f.name + ":" + f.file.size + ":" + f.file.lastModified;
  const std = files.find((f) => f.name.toLowerCase() === PLANT.standardsFile.toLowerCase());
  if (std && sig(std) !== cache.standardsSig) {
    cache.standards = readStandards(XLSX, await std.file.arrayBuffer());
    cache.standardsSig = sig(std);
    cache.cells = {}; // re-read cells with the new standards
  }
  const clock = plantClock(new Date());
  const shift = currentShift(clock);
  const thisWeek = mondayOf(shift.dayISO);
  const mondays = [thisWeek, addDays(thisWeek, -7)];
  const cells = {};
  for (const f of files) {
    const m = PLANT.cellFilePattern.exec(f.name);
    if (!m) continue;
    const name = allCells().find((c) => c.toLowerCase() === m[1].trim().toLowerCase()) || m[1].trim();
    const key = sig(f) + "|" + mondays.join(",") + "|" + cache.standardsSig;
    if (!cache.cells[f.name] || cache.cells[f.name].key !== key) {
      try {
        const cell = readCellWorkbook(XLSX, await f.file.arrayBuffer(), f.name, cache.standards, mondays);
        cache.cells[f.name] = { key, cell: Object.assign(cell, { savedAt: new Date(f.file.lastModified).toISOString() }) };
      } catch (err) {
        // OneDrive may be writing the file: keep the last good read and try again in 10 s.
        if (!cache.cells[f.name]) continue;
      }
    }
    cells[name] = cache.cells[f.name].cell;
  }
  state.data = { cells, timeZone: PLANT.timeZone, missingStandards: !std, standardsSavedAt: std ? new Date(std.file.lastModified).toISOString() : "" };
  const warnings = Object.values(cells).flatMap((c) => c.warnings.map((w) => c.cell + ": " + w));
  if (!std) warnings.unshift("Production Standards.xlsx not found in the folder: using the values the workbooks show");
  state.status = `${Object.keys(cells).length} cell workbooks read` + (warnings.length ? " · " + warnings.join(" · ") : "");
  await publish();
}

const KEY_LS = "tarter-gate-publish-key";
async function publish() {
  const body = JSON.stringify({ data: state.data, sourceLabel: PLANT.code + " source PC" });
  const now = Date.now();
  if (body === cache.publishedBody && now - cache.publishedAt < HEARTBEAT_MS) return;
  try {
    let key = "";
    try { key = localStorage.getItem(KEY_LS) || ""; } catch (e) {}
    const res = await fetch("/api/publish", { method: "POST", headers: { "Content-Type": "application/json", "x-publish-key": key }, body, signal: AbortSignal.timeout(20e3) });
    if (res.status === 401) { $("keyRow").hidden = false; state.status += " · TVs NOT updated: enter the publish key"; return; }
    if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 120));
    cache.publishedBody = body;
    cache.publishedAt = now;
    state.status += " · TVs updated " + new Date().toLocaleTimeString("en-US");
  } catch (err) {
    state.status += " · TVs NOT updated: " + err.message;
  }
}

function showReconnect() {
  $("connect").textContent = "RECONNECT FOLDER";
  $("connect").classList.add("warn");
  state.status = "Click RECONNECT FOLDER to give the browser access again (Windows restarted or the tab was closed).";
}

async function connect() {
  try {
    let dir = cache.dir;
    if (dir && (await dir.requestPermission({ mode: "read" })) === "granted") {
      // same folder, access granted again
    } else {
      dir = await showDirectoryPicker({ id: "tarter-gate", mode: "read" });
      await idb("readwrite", (s) => s.put(dir, "folder"));
    }
    cache.dir = dir;
    $("connect").textContent = "CONNECTED: " + dir.name;
    $("connect").classList.remove("warn");
    await tick();
  } catch (err) {
    state.status = "Folder not connected: " + err.message;
    paintStatus();
  }
}

function paintStatus() {
  const el = $("status");
  if (el) el.textContent = state.status;
}

async function tick() {
  try {
    if (MODE === "tv") await pullFeed();
    else if (MODE === "source") await readFolder();
  } catch (err) {
    state.status = "Error: " + err.message;
  }
  draw();
  paintStatus();
}

async function start() {
  document.body.classList.add("mode-" + MODE);
  if (MODE === "source") {
    $("bar").hidden = false;
    // Only the source PC reads Excel files, so only it downloads the Excel reader.
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/vendor/xlsx.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load the Excel reader"));
      document.head.appendChild(s);
    });
    $("connect").addEventListener("click", connect);
    $("saveKey").addEventListener("click", () => {
      try { localStorage.setItem(KEY_LS, $("key").value.trim()); } catch (e) {}
      $("keyRow").hidden = true;
      cache.publishedBody = "";
      tick();
    });
    if (!window.showDirectoryPicker) state.status = "Open this page in Chrome or Edge on Windows: other browsers can't read a folder.";
    try {
      const saved = await idb("readonly", (s) => s.get("folder"));
      if (saved) {
        cache.dir = saved;
        if ((await saved.queryPermission({ mode: "read" })) === "granted") $("connect").textContent = "CONNECTED: " + saved.name;
        else showReconnect();
      }
    } catch (e) {}
    if ("wakeLock" in navigator) navigator.wakeLock.request("screen").catch(() => {});
  }
  await tick();
  setInterval(tick, MODE === "tv" ? TV_CHECK_MS : MODE === "source" ? SOURCE_CHECK_MS : 30e3);
  setInterval(draw, 30e3); // clock and pace move even when nothing new arrives
  setTimeout(() => location.reload(), 24 * 3600e3); // a fresh page once a day
}

start();
