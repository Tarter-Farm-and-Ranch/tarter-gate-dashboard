// Tarter Portal feed. Inside the portal the page is served from this repo with a _feed/
// folder next to it, which the portal fills from SharePoint (no source PC):
//   _feed/manifest.json  { status: "ok"|"failing"|"paused", problem, serverTime, checkedAt,
//                          files: [{ path, modified, size, etag, url }],
//                          snapshot: { url } (when the portal built snapshot.json's summary) }
//   each file's url      the workbook as JSON, as SheetJS reads it ({ SheetNames, Sheets })
// The same reader as the source PC turns those workbooks into the screens' data, either on
// the portal server (js/snapshot.js, so TVs download a few KB) or in the browser.
// Without a feed (a 404 on Vercel, or file://) the page works as before.

var Gate = Gate || {};

(function (G) {
  G.PORTAL_MANIFEST = "_feed/manifest.json";

  /** A file's url, relative to the manifest ("files/x.json") or to the page ("_feed/files/x.json"). */
  G.portalFileUrl = function (url) {
    const clean = String(url || "").replace(/^\/+/, "");
    if (clean.indexOf("_feed/") === 0) return clean;
    return G.PORTAL_MANIFEST.slice(0, G.PORTAL_MANIFEST.lastIndexOf("/") + 1) + clean;
  };

  /** The manifest's files in the shape Gate.collect reads; load(file) opens one workbook. */
  G.portalFiles = function (manifest, load) {
    const out = [];
    for (const f of Array.isArray(manifest && manifest.files) ? manifest.files : []) {
      if (!f || typeof f.path !== "string" || typeof f.url !== "string") continue;
      const modified = Date.parse(f.modified);
      out.push({
        name: f.path.replace(/\\/g, "/").replace(/^\/+/, ""),
        // The url carries the etag: a new url is a changed file.
        sig: f.path + ":" + f.url,
        modified: Number.isFinite(modified) ? modified : 0,
        load: () => load(f)
      });
    }
    return out;
  };

  /** The portal's state of the files: "" when fine, else why the numbers may be old. */
  G.portalProblem = function (manifest) {
    if (!manifest || manifest.status === undefined || manifest.status === "ok") return "";
    const problem = typeof manifest.problem === "string" ? manifest.problem.trim().slice(0, 120) : "";
    return "CAN'T READ THE EXCEL FILES" + (problem ? ": " + problem : manifest.status === "paused" ? ": updates paused" : "");
  };
})(Gate);
