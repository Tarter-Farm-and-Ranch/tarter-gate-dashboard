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

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
export function start(port = 0) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
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
    let file = url.pathname === "/" || /^\/(tv|preview)(\/|$)/.test(url.pathname) ? "/index.html" : url.pathname;
    const full = path.join(root, file);
    if (!full.startsWith(root) || !fs.existsSync(full)) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", TYPES[path.extname(full)] || "application/octet-stream");
    fs.createReadStream(full).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  start(Number(process.argv[2]) || 8780).then((s) => console.log("http://localhost:" + s.address().port));
}
