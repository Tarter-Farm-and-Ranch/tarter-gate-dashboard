// Portal snapshot: the summary every screen reads, built by the Tarter Portal server from
// the workbooks in the feed (see snapshot.json for the scripts it runs first). The host
// calls buildGateSnapshot(manifestText, previousText), stores the text it returns as
// _feed/snapshot.json and points manifest.snapshot.url at it, so TVs download a few KB
// instead of every workbook and the 20,000-row standards export.
//
// The host provides:
//   __readFeedFile(url)  the feed workbook at that manifest url, as JSON text
//   __log(text)          a line for the portal's log (optional)

var GATE_SNAPSHOT_VERSION = 1;

async function buildGateSnapshot(manifestText, previousText) {
  const manifest = JSON.parse(manifestText);
  if (!manifest || !Array.isArray(manifest.files)) throw new Error("The feed manifest has no file list.");
  const log = (t) => { try { if (typeof __log === "function") __log(t); } catch (e) {} };
  const nowMs = Date.parse(manifest.serverTime) || Date.now();
  const files = Gate.portalFiles(manifest, async (f) => JSON.parse(await __readFeedFile(f.url)));
  let previous = null;
  try { previous = previousText ? JSON.parse(previousText) : null; } catch (e) { previous = null; }
  const keepPrevious = (why) => {
    if (!previous || !previous.data || !previous.data.cells || !Object.keys(previous.data.cells).length) return null;
    previous.sourceError = why.slice(0, 200);
    return JSON.stringify(previous);
  };

  let result;
  try {
    result = await Gate.collect(files, {}, nowMs);
  } catch (err) {
    const why = err && err.message ? err.message : String(err);
    log("Gate snapshot: " + why);
    const prev = keepPrevious("Can't read the Excel files: " + why);
    if (prev) return prev;
    throw err;
  }
  for (const w of result.warnings) log("Gate snapshot: " + w);
  if (!Object.keys(result.data.cells).length) {
    const prev = keepPrevious("Can't read the Excel files: " + (result.warnings[0] || "no cell workbooks in the feed"));
    if (prev) return prev;
  }
  // A workbook that can't be read right now (being saved) keeps its last good numbers.
  const prevCells = previous && previous.data && previous.data.cells ? previous.data.cells : {};
  for (const name of result.failed) if (prevCells[name]) result.data.cells[name] = prevCells[name];
  return JSON.stringify({
    v: GATE_SNAPSHOT_VERSION,
    builtAt: new Date(nowMs).toISOString(),
    data: result.data,
    warnings: result.warnings.slice(0, 40)
  });
}
