import { getSnapshot } from "../lib/db.js";

// GET from every screen: the last published data plus
//   changedAt   - when the numbers last changed
//   heartbeatAt - when the source PC last checked in (a TV warns if it goes quiet)
//   serverTime  - so a screen with a wrong clock still measures heartbeat age correctly
export default async function handler(req, res) {
  let row;
  try {
    row = await getSnapshot();
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: err.code || "read_failed", message: err.message });
    return;
  }
  if (!row || !row.data) {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).json({ error: "no_snapshot", message: "The source PC hasn't published yet." });
    return;
  }
  // Cached 5 s at Vercel's edge, so any number of TVs cost about one database read every 5 s.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=10");
  res.status(200).json({
    data: row.data,
    sourceLabel: row.source_label || "",
    changedAt: row.changed_at || row.updated_at,
    heartbeatAt: row.updated_at,
    serverTime: new Date().toISOString()
  });
}
