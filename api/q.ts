// ============================================================
// Public QR redirect: /q/:code → wherever that code currently points.
//
// The printed QR encodes this permanent Slate link, never the destination, so
// Geoff can re-point a code that is already on flyers, signs and business
// cards. A code can also be a contact card (the scan offers "add to
// contacts") or carry a scheduled switch-over to a second link. Each scan is
// counted and logged (device, country, referer — never the IP), and link
// forwards carry utm tags so Google Analytics reports the scan as its own
// traffic source. Wired up by the /q/:code rewrite in vercel.json; the
// service worker leaves /q/ alone (vite.config.ts denylist).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { buildVCard, effectiveTarget, type QrContact } from "./_qr.js";

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
function safeTarget(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** utm_campaign value: the code's name, lower-case, dashes for spaces. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** Add Google Analytics tags unless the destination already carries its own. */
function withUtm(target: URL, name: string, code: string): string {
  const has = [...target.searchParams.keys()].some(k => k.startsWith("utm_"));
  if (!has) {
    target.searchParams.set("utm_source", "qr");
    target.searchParams.set("utm_medium", "print");
    target.searchParams.set("utm_campaign", slug(name) || code);
    target.searchParams.set("utm_content", code);
  }
  return target.toString();
}

function deviceFrom(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(s)) return "tablet";
  if (/iphone|android.*mobile|windows phone|mobile/.test(s)) return "phone";
  if (/macintosh|windows nt|x11|linux/.test(s)) return "desktop";
  return "other";
}

interface Row {
  id: string; org_id: string; name: string; code: string; kind: string; contact: QrContact | null;
  target_url: string; next_target_url: string | null; switch_at: string | null; scan_count: number; utm_enabled: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.code;
  const code = (Array.isArray(raw) ? raw[0] : raw || "").trim();
  res.setHeader("Cache-Control", "no-store");
  if (!code) return res.status(404).send(page("Nothing here", "This QR code isn't set up yet."));

  const { data: row } = await supabase
    .from("qr_codes")
    .select("id, org_id, name, code, kind, contact, target_url, next_target_url, switch_at, scan_count, utm_enabled")
    .eq("code", code)
    .maybeSingle<Row>();
  if (!row) return res.status(404).send(page("Nothing here", "This QR code isn't pointing anywhere right now."));

  // Count and log the scan, but never make the visitor wait on it.
  const ua = String(req.headers["user-agent"] || "");
  const country = String(req.headers["x-vercel-ip-country"] || "");
  const referer = String(req.headers["referer"] || "").slice(0, 300);
  const log = () => void Promise.all([
    supabase.from("qr_codes")
      .update({ scan_count: (row.scan_count || 0) + 1, last_scanned_at: new Date().toISOString() })
      .eq("id", row.id),
    supabase.from("qr_scans")
      .insert({ id: nanoid(12), org_id: row.org_id, qr_code_id: row.id, device: deviceFrom(ua), country, referer }),
  ]).then(results => {
    for (const r of results) if (r.error) console.error("[q] scan log failed", r.error.message);
  });

  if (row.kind === "contact") {
    const vcf = buildVCard(row.contact || {});
    log();
    const fname = (slug(row.name) || "contact") + ".vcf";
    res.setHeader("Content-Type", "text/vcard; charset=utf-8");
    // inline (not attachment): iPhones open it as a contact card to save.
    res.setHeader("Content-Disposition", `inline; filename="${fname}"`);
    return res.status(200).send(vcf);
  }

  const target = safeTarget(effectiveTarget(row));
  if (!target) return res.status(404).send(page("Nothing here", "This QR code isn't pointing anywhere right now."));
  const dest = row.utm_enabled === false ? target.toString() : withUtm(target, row.name, row.code);
  log();
  res.setHeader("Location", dest);
  return res.status(302).end();
}
