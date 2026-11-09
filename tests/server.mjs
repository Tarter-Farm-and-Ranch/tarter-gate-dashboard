// Local stand-in for Vercel: serves the repo, applies vercel.json rewrites and runs the
// api/*.js handlers with Supabase replaced by an in-memory row.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
export const db = { row: null, writes: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith("https://example.supabase.co/rest/v1/gate_snapshot")) return realFetch(url, opts);
  if ((opts.method || "GET") === "POST") {
    db.row = JSON.parse(opts.body);
    db.writes++;
    return new Response(null, { status: 201 });
  }
  return new Response(JSON.stringify(db.row ? [db.row] : []), { status: 200, headers: { "content-type": "application/json" } });
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
function sendFile(res, base, rel) {
  const full = path.join(base, rel);
  if (!full.startsWith(base) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.statusCode = 404; res.end("not found"); return; }
  res.setHeader("content-type", TYPES[path.extname(full)] || "application/octet-stream");
  fs.createReadStream(full).pipe(res);
}
const REDIRECTS = [[/^\/tv\/?$/, "/?tv=1"], [/^\/tv\/([^/]+)$/, "/?tv=1&cell=$1"], [/^\/preview\/?$/, "/?preview=1"], [/^\/preview\/([^/]+)$/, "/?preview=1&cell=$1"]];

/**
 * Vercel stand-in, or with `portal` (a folder holding manifest.json, files/, snapshot.json)
 * a Tarter Portal stand-in: the repo served under /d/gate/ with that folder as its _feed/.
 */
export function start(port = 0, opts = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (opts.portal) {
      if (!url.pathname.startsWith("/d/gate/")) { res.statusCode = 404; res.end("not found"); return; }
      const rel = decodeURIComponent(url.pathname.slice("/d/gate/".length)) || "index.html";
      if (rel.startsWith("_feed/")) return sendFile(res, path.resolve(opts.portal), rel.slice(6));
      if (rel.startsWith("api/")) { res.statusCode = 404; res.end("not found"); return; }
      return sendFile(res, root, rel);
    }
    for (const [re, to] of REDIRECTS) {
      const m = re.exec(url.pathname);
      if (m) { res.statusCode = 307; res.setHeader("location", to.replace("$1", m[1] || "")); res.end(); return; }
    }
    if (url.pathname.startsWith("/api/")) {
      const mod = await import(pathToFileURL(path.join(root, url.pathname + ".js")).href);
      let body = "";
      for await (const chunk of req) body += chunk;
      const r = {
        status(c) { res.statusCode = c; return r; },
        setHeader(k, v) { res.setHeader(k, v); },
        json(o) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); }
      };
      await mod.default({ method: req.method, headers: req.headers, body: body ? JSON.parse(body) : undefined }, r);
      return;
    }
    sendFile(res, root, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  start(Number(process.argv[2]) || 8780, { portal: process.argv[3] }).then((s) => console.log("http://localhost:" + s.address().port));
}
