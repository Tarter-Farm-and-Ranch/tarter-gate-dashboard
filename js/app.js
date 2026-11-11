// Page logic. Ways to open it:
//   inside the Tarter Portal   the page finds _feed/manifest.json next to itself and shows
//                              what the portal read from SharePoint (no source PC needed)
//   ?tv=1                      Vercel TVs: read what the source PC published
//   (no parameters, Vercel)    source PC: connect the SharePoint folder (synced with
//                              OneDrive), read the workbooks every 10 s and publish them
//   ?preview=1                 sample data, nothing read or published
// Plant screen by default; ?cell=TK1 (or #cell=TK1) shows one cell; ?scale=0.9 forces a size.

(function (G) {
  const PLANT = G.PLANT;
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const CELL = params.get("cell") || hash.get("cell") || null;
  const SOURCE_CHECK_MS = 10e3, TV_CHECK_MS = 15e3, PORTAL_CHECK_MS = 15e3, PORTAL_STALE_MS = 3 * 60e3, HEARTBEAT_MS = 60e3;

  let MODE = params.get("preview") === "1" ? "preview" : params.get("tv") === "1" ? "tv" : "source";
  const state = { data: null, alert: "", lastOkFetch: Date.now(), status: "", offsetMs: 0, connecting: true };
  const $ = (id) => document.getElementById(id);
  const now = () => new Date(Date.now() + state.offsetMs);
  const timeText = (ms) => new Date(ms).toLocaleTimeString("en-US", { timeZone: PLANT.timeZone, hour: "numeric", minute: "2-digit" });
  const errText = (err) => (err && err.message ? err.message : String(err));

  // ---------- drawing ----------
  function draw() {
    const t = now();
    const data = MODE === "preview" ? G.sampleData(t) : state.data;
    const opts = { sample: MODE === "preview", alert: state.alert };
    let html;
    if (!data) {
      const text = state.connecting ? "CONNECTING…" : MODE === "source" ? "CONNECT THE PRODUCTION REPORTING FOLDER" : state.alert || "WAITING FOR DATA";
      html = G.renderWaiting(t, text, { alert: "" });
    } else {
      const view = G.buildView(data, t);
      html = CELL ? G.renderCell(view, CELL, t, opts) : G.renderPlant(view, t, opts);
    }
    $("root").innerHTML = html;
    fit();
  }
  // The clock shows seconds: only its text changes between full redraws.
  function tickClock() {
    const el = document.querySelector("[data-clock]");
    if (!el) return;
    const c = G.clockText(now());
    el.textContent = c.time;
    const d = document.querySelector("[data-date]");
    if (d && d.textContent !== c.date) d.textContent = c.date;
  }
  function fit() {
    // The source PC's bar sits under the screen, not over it (like West's).
    const bar = $("bar");
    const barH = bar && !bar.hidden ? bar.offsetHeight : 0;
    const s = Number(params.get("scale")) || Math.min(innerWidth / 1920, (innerHeight - barH) / 1080);
    const screen = document.querySelector(".screen");
    if (!screen) return;
    // A window wider than 16:9: the screen grows wider instead of leaving a blank strip.
    screen.style.width = Math.max(1920, Math.floor(innerWidth / s)) + "px";
    screen.style.transform = "scale(" + s + ")";
  }
  addEventListener("resize", fit);

  async function fetchJson(url, opts, ms) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms || 20e3) : null;
    try {
      const res = await fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opts || {}));
      const body = res.ok ? await res.json() : null;
      return { status: res.status, ok: res.ok, body };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ---------- Tarter Portal ----------
  const portal = { books: {}, cache: {}, snapshotUrl: "", lastText: "" };
  async function probePortal() {
    if (location.protocol === "file:") return null;
    try {
      const r = await fetchJson(G.PORTAL_MANIFEST, { cache: "no-store" }, 10e3);
      return r.status === 200 && r.body && Array.isArray(r.body.files) ? r.body : null;
    } catch (err) {
      return null;
    }
  }
  async function feedWorkbook(f) {
    const url = G.portalFileUrl(f.url);
    if (!portal.books[url]) {
      // No cache-buster: the url changes whenever the file does.
      const r = await fetchJson(url, {}, 60e3);
      if (!r.ok || !r.body || !r.body.Sheets) throw new Error("HTTP " + r.status);
      portal.books[url] = r.body;
    }
    return portal.books[url];
  }
  async function pullPortal(first) {
    let manifest = first;
    if (!manifest) {
      const r = await fetchJson(G.PORTAL_MANIFEST, { cache: "no-store" });
      if (!r.ok || !r.body || !Array.isArray(r.body.files)) throw new Error("Portal feed: HTTP " + r.status);
      manifest = r.body;
    }
    state.lastOkFetch = Date.now();
    // TV clocks can be wrong; the portal server's isn't.
    const server = Date.parse(manifest.serverTime);
    if (Number.isFinite(server)) state.offsetMs = Math.abs(server - Date.now()) > 60e3 ? server - Date.now() : 0;
    const problem = G.portalProblem(manifest);
    let sourceError = "";
    // While the portal can't read SharePoint, keep the last good numbers (with the banner).
    if (!(problem && state.data)) {
      const snap = manifest.snapshot && typeof manifest.snapshot === "object" ? manifest.snapshot : null;
      if (snap && typeof snap.url === "string" && snap.url) {
        const url = G.portalFileUrl(snap.url);
        if (url !== portal.snapshotUrl || !state.data) {
          const r = await fetchJson(url, { cache: "no-store" });
          if (!r.ok || !r.body || !r.body.data || !r.body.data.cells) throw new Error("Portal summary: HTTP " + r.status);
          state.data = r.body.data;
          portal.snapshotUrl = url;
          portal.sourceError = typeof r.body.sourceError === "string" ? r.body.sourceError : "";
        }
        sourceError = portal.sourceError || "";
      } else if (manifest.summaryOnly === true) {
        throw new Error("The portal hasn't built this board's summary yet" + (snap && snap.problem ? ": " + String(snap.problem).slice(0, 120) : ""));
      } else {
        const live = {};
        for (const f of manifest.files) if (f && typeof f.url === "string") live[G.portalFileUrl(f.url)] = true;
        for (const url of Object.keys(portal.books)) if (!live[url]) delete portal.books[url];
        const r = await G.collect(G.portalFiles(manifest, feedWorkbook), portal.cache, now().getTime());
        state.data = r.data;
      }
    }
    const checked = Date.parse(manifest.checkedAt);
    // The portal's rule: a feed not checked for over 3 minutes is "data not updating"
    // (the last numbers stay on the screen).
    const stale = Number.isFinite(checked) && now().getTime() - checked > PORTAL_STALE_MS;
    const issue = problem || (sourceError ? "CAN'T READ THE EXCEL FILES: " + sourceError.replace(/^Can't read the Excel files:\s*/i, "") : "") || (stale ? "DATA NOT UPDATING · LAST READ " + timeText(checked) : "");
    state.alert = issue ? issue + (Number.isFinite(checked) && !stale ? " · DATA FROM " + timeText(checked) : "") : "";
    tellPortal(issue ? "Problem: " + issue.toLowerCase() : "Updated " + timeText(Number.isFinite(checked) ? checked : now().getTime()));
  }
  // The portal's TV bar shows a status line the page posts to it.
  function tellPortal(text) {
    text = String(text).slice(0, 60); // the TV bar takes 60 characters at most
    if (MODE !== "portal" || text === portal.lastText) return;
    portal.lastText = text;
    try { if (window.parent && window.parent !== window) window.parent.postMessage({ tvUpdated: text }, "*"); } catch (err) {}
  }

  // ---------- Vercel TVs: read the published snapshot ----------
  async function pullFeed() {
    const r = await fetchJson("api/feed-snapshot", { cache: "no-store" });
    if (r.status === 404) { state.alert = "WAITING FOR THE SOURCE PC TO PUBLISH"; return; }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const feed = r.body;
    state.data = feed.data;
    state.lastOkFetch = Date.now();
    const age = Date.parse(feed.serverTime) - Date.parse(feed.heartbeatAt);
    state.alert = age > 3 * 60e3 ? "SOURCE PC IS NOT SENDING · DATA FROM " + timeText(Date.parse(feed.heartbeatAt)) : "";
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
  async function listFiles(dir, prefix, depth, out) {
    for await (const entry of dir.values()) {
      if (entry.kind === "file" && /\.xlsx$/i.test(entry.name)) out.push({ entry, path: prefix + entry.name });
      else if (entry.kind === "directory" && depth < 2 && !/^(archive|old|backup)$/i.test(entry.name)) await listFiles(entry, prefix + entry.name + "/", depth + 1, out);
    }
    return out;
  }

  const source = { dir: null, cache: {}, publishedBody: "", publishedAt: 0 };
  async function readFolder() {
    const dir = source.dir;
    if (!dir) return;
    if ((await dir.queryPermission({ mode: "read" })) !== "granted") { showReconnect(); return; }
    const entries = await listFiles(dir, "", 0, []);
    const files = await Promise.all(entries.map(async ({ entry, path }) => {
      const file = await entry.getFile();
      return {
        name: path,
        sig: path + ":" + file.size + ":" + file.lastModified,
        modified: file.lastModified,
        load: async () => XLSX.read(await file.arrayBuffer(), { type: "array" })
      };
    }));
    const r = await G.collect(files, source.cache, Date.now());
    state.data = r.data;
    // Which folder, and when each cell on the screen was last saved: the quick check that
    // the workbook being edited is the one in this folder (and that it was saved).
    const shownSaves = G.shownAreas(r.data.showCells).reduce((all, a) => all.concat(a.cells), []).map((n) => {
      const c = r.data.cells[n];
      return n + " " + (c && c.savedAt ? G.savedText(c.savedAt, new Date()).toLowerCase() : "no workbook");
    });
    state.status = "Folder \"" + dir.name + "\" · " + shownSaves.join(" · ") + " · " + Object.keys(r.data.cells).length + " cell workbooks read" + (r.warnings.length ? " · " + r.warnings.join(" · ") : "");
    await publish();
  }

  const KEY_LS = "tarter-gate-publish-key";
  async function publish() {
    const body = JSON.stringify({ data: state.data, sourceLabel: PLANT.code + " source PC" });
    const t = Date.now();
    if (body === source.publishedBody && t - source.publishedAt < HEARTBEAT_MS) return;
    try {
      let key = "";
      try { key = localStorage.getItem(KEY_LS) || ""; } catch (e) {}
      const res = await fetch("api/publish", { method: "POST", headers: { "Content-Type": "application/json", "x-publish-key": key }, body });
      if (res.status === 401) { $("keyRow").hidden = false; state.status += " · TVs NOT updated: enter the publish key"; return; }
      if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 120));
      source.publishedBody = body;
      source.publishedAt = t;
      state.status += " · TVs updated " + new Date().toLocaleTimeString("en-US", { timeZone: PLANT.timeZone, hour: "numeric", minute: "2-digit", second: "2-digit" });
    } catch (err) {
      state.status += " · TVs NOT updated: " + errText(err);
    }
  }

  function showReconnect() {
    $("connect").textContent = "RECONNECT FOLDER";
    $("connect").classList.add("warn");
    state.status = "Click RECONNECT FOLDER to give the browser access again (Windows restarted or the tab was closed).";
  }

  function showConnected(dir) {
    $("connect").textContent = "CONNECTED: " + dir.name;
    $("connect").classList.remove("warn");
    $("change").hidden = false;
    $("sync").hidden = false;
  }

  /** First connection, or "Reconnect" after a restart: the same folder, access granted again. */
  async function connect() {
    try {
      if (source.dir && (await source.dir.requestPermission({ mode: "read" })) === "granted") {
        showConnected(source.dir);
        await tick();
        return;
      }
      await pickFolder();
    } catch (err) {
      state.status = "Folder not connected: " + errText(err);
      paintStatus();
    }
  }

  /** Choose a (different) folder: always opens the folder picker. */
  async function pickFolder() {
    try {
      const dir = await showDirectoryPicker({ id: "tarter-gate", mode: "read" });
      await idb("readwrite", (s) => s.put(dir, "folder"));
      source.dir = dir;
      source.cache = {};
      source.publishedBody = "";
      showConnected(dir);
      await tick();
    } catch (err) {
      if (err && err.name === "AbortError") return; // picker closed: keep the folder there was
      state.status = "Folder not changed: " + errText(err);
      paintStatus();
    }
  }

  /** Read every workbook again right now and send the TVs the result. */
  async function syncNow() {
    source.cache = {};
    source.publishedBody = "";
    state.status = "Reading the folder…";
    paintStatus();
    await tick();
  }

  function paintStatus() {
    const el = $("status");
    if (el && state.status) { el.textContent = state.status; el.title = state.status; }
  }

  // A page that got no answer from the portal's feed when it opened (a slow first reply)
  // keeps looking for it while it has nothing to show, instead of staying on "waiting".
  async function findPortalLate() {
    if (state.data || !(MODE === "tv" || (MODE === "source" && !source.dir))) return null;
    const manifest = await probePortal();
    if (!manifest) return null;
    document.body.classList.remove("mode-" + MODE);
    MODE = "portal";
    document.body.classList.add("mode-portal");
    $("bar").hidden = true;
    watchForNewVersion();
    return manifest;
  }

  async function tick(first) {
    try {
      if (!first) first = await findPortalLate();
      if (MODE === "portal") await pullPortal(first);
      else if (MODE === "tv") await pullFeed();
      else if (MODE === "source") await readFolder();
    } catch (err) {
      if (MODE === "source") state.status = "Error: " + errText(err);
      else if (Date.now() - state.lastOkFetch > 15 * 60e3 || !state.data) {
        state.alert = (MODE === "portal" ? "NO CONNECTION TO THE PORTAL" : "NO CONNECTION TO SERVER") + (state.data ? "" : " · " + errText(err).slice(0, 100));
        tellPortal("No connection");
      }
    }
    state.connecting = false;
    draw();
    paintStatus();
  }

  async function pageText() {
    const res = await fetch(location.pathname + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    let text = await res.text();
    // The page's own scripts count too: a change to js/*.js is a new version.
    for (const m of text.matchAll(/<script src="([^"]+)"/g)) {
      const r = await fetch(m[1] + (m[1].indexOf("?") < 0 ? "?" : "&") + "v=" + Date.now(), { cache: "no-store" });
      if (r.ok) text += await r.text();
    }
    return text;
  }
  let watching = false;
  async function watchForNewVersion() {
    if (watching) return;
    watching = true;
    let first;
    try { first = await pageText(); } catch (err) { return; }
    setInterval(async () => {
      try { if ((await pageText()) !== first) location.reload(); } catch (err) {}
    }, 5 * 60e3);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  async function start() {
    draw();
    let manifest = null;
    if (MODE !== "preview") {
      manifest = await probePortal();
      if (manifest) MODE = "portal";
    }
    document.body.classList.add("mode-" + MODE);
    if (MODE === "source") {
      $("bar").hidden = false;
      fit();
      // Only the source PC reads Excel files, so only it downloads the Excel reader.
      await loadScript("vendor/xlsx.js");
      $("connect").addEventListener("click", connect);
      $("change").addEventListener("click", pickFolder);
      $("sync").addEventListener("click", syncNow);
      $("saveKey").addEventListener("click", () => {
        try { localStorage.setItem(KEY_LS, $("key").value.trim()); } catch (e) {}
        $("keyRow").hidden = true;
        source.publishedBody = "";
        tick();
      });
      if (!window.showDirectoryPicker) state.status = "Open this page in Chrome or Edge on Windows: other browsers can't read a folder.";
      try {
        const saved = await idb("readonly", (s) => s.get("folder"));
        if (saved) {
          source.dir = saved;
          if ((await saved.queryPermission({ mode: "read" })) === "granted") showConnected(saved);
          else { showReconnect(); $("change").hidden = false; }
        }
      } catch (e) {}
      if ("wakeLock" in navigator) navigator.wakeLock.request("screen").catch(() => {});
    }
    await tick(manifest);
    const every = MODE === "portal" ? PORTAL_CHECK_MS : MODE === "tv" ? TV_CHECK_MS : MODE === "source" ? SOURCE_CHECK_MS : 30e3;
    setInterval(() => tick(), every);
    setInterval(draw, 30e3); // shift time left and pace move even when nothing new arrives
    setInterval(tickClock, 1e3);
    setTimeout(() => location.reload(), 24 * 3600e3); // a fresh page once a day
    // TVs pick up a new version of the dashboard by themselves: every 5 minutes the page
    // compares itself with the server's copy and reloads when it changed. Not on the
    // source PC, where a reload would ask for the folder permission again.
    if (MODE === "tv" || MODE === "portal") watchForNewVersion();
  }

  start();
})(Gate);
