import { getSnapshot, setSnapshot } from "../lib/db.js";
import { cleanData, canonical } from "../lib/clean.js";

const MAX_BYTES = 600 * 1024;

// POST from the source PC: { data, sourceLabel }. Saves the raw week data of every cell;
// the screens compute the numbers themselves for the current minute.
// If the PUBLISH_KEY env var is set, the request must send it in the x-publish-key header.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const needKey = (process.env.PUBLISH_KEY || "").trim();
  if (needKey && req.headers["x-publish-key"] !== needKey) {
    res.status(401).json({ error: "bad_key", message: "Wrong or missing publish key." });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    if (body.length > MAX_BYTES) { res.status(413).json({ error: "too_large" }); return; }
    try { body = JSON.parse(body); } catch (e) { res.status(400).json({ error: "bad_json" }); return; }
  }
  if (!body || typeof body !== "object") { res.status(400).json({ error: "bad_body" }); return; }
  const data = cleanData(body.data);
  if (!data) { res.status(400).json({ error: "bad_data", message: "Expected { data: { cells: {...} } }." }); return; }
  const text = JSON.stringify(data);
  if (text.length > MAX_BYTES) { res.status(413).json({ error: "too_large" }); return; }
  try {
    // The row's updated_at moves on every call (heartbeat); changed_at only when numbers change.
    const prev = await getSnapshot();
    const same = !!prev && canonical(cleanData(prev.data)) === canonical(data);
    const changedAt = same && prev.changed_at ? prev.changed_at : new Date().toISOString();
    await setSnapshot(data, String(body.sourceLabel || "").slice(0, 120), changedAt);
    res.status(200).json({ ok: true, changed: !same, changedAt });
  } catch (err) {
    res.status(503).json({ error: err.code || "write_failed", message: err.message });
  }
}
