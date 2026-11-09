// The latest snapshot the source PC published: one row (id = 1) in a Supabase table.
// RLS is on with no policies, so only the service_role key - kept in Vercel's server-side
// environment variables, never in the browser - can read or write it.
//
// Vercel env vars: SUPABASE_URL (https://<project>.supabase.co) and SUPABASE_SERVICE_ROLE_KEY.

function config() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    const err = new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the Vercel project's Environment Variables.");
    err.code = "not_configured";
    throw err;
  }
  if (key.startsWith("sb_publishable_")) {
    const err = new Error("SUPABASE_SERVICE_ROLE_KEY holds the publishable key; use the secret (sb_secret_...) key.");
    err.code = "wrong_key";
    throw err;
  }
  return { url, headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" } };
}

const TIMEOUT_MS = 8000;
async function call(path, opts = {}) {
  const { url, headers } = config();
  const res = await fetch(url + "/rest/v1/" + path, Object.assign({}, opts, {
    headers: Object.assign({}, headers, opts.headers || {}),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }));
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 200); } catch (e) {}
    const err = new Error("Supabase " + (opts.method || "GET") + " failed: HTTP " + res.status + (detail ? " " + detail : ""));
    err.code = "supabase_failed";
    throw err;
  }
  return res;
}

export async function getSnapshot() {
  const res = await call("gate_snapshot?select=data,source_label,changed_at,updated_at&id=eq.1");
  const rows = await res.json();
  return rows.length ? rows[0] : null;
}

export async function setSnapshot(data, sourceLabel, changedAt) {
  await call("gate_snapshot", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, data, source_label: sourceLabel || null, changed_at: changedAt, updated_at: new Date().toISOString() })
  });
}
