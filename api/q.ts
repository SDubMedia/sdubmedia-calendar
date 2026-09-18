// ============================================================
// Public QR redirect: /q/:code → wherever that code currently points.
//
// The printed QR encodes this permanent Slate link, never the destination, so
// Geoff can re-point a code that is already on flyers, signs and business
// cards. Scans are counted here. Wired up by the /q/:code rewrite in
// vercel.json; the service worker leaves /q/ alone (vite.config.ts denylist).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f19;color:#e5e7eb;font:16px/1.5 -apple-system,system-ui,sans-serif;text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#9ca3af}</style>
</head><body><div><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

/** Only http(s) destinations are ever redirected to — a stored javascript: or
 *  data: URL must not become a live link on our domain. */
function safeTarget(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.code;
  const code = (Array.isArray(raw) ? raw[0] : raw || "").trim();
  res.setHeader("Cache-Control", "no-store");
  if (!code) return res.status(404).send(page("Nothing here", "This QR code isn't set up yet."));

  const { data: row } = await supabase
    .from("qr_codes")
    .select("id, target_url, scan_count")
    .eq("code", code)
    .maybeSingle<{ id: string; target_url: string; scan_count: number }>();

  const target = row ? safeTarget(row.target_url) : null;
  if (!row || !target) {
    return res.status(404).send(page("Nothing here", "This QR code isn't pointing anywhere right now."));
  }

  // Count the scan, but never make the visitor wait on it.
  void supabase
    .from("qr_codes")
    .update({ scan_count: (row.scan_count || 0) + 1, last_scanned_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(({ error }) => { if (error) console.error("[q] scan count failed", error.message); });

  res.setHeader("Location", target);
  return res.status(302).end();
}
