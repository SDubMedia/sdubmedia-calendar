// ============================================================
// QR image endpoint. Emails need this: every client-facing email in Slate is
// rendered without data: URLs (email clients strip them — see _emailBranding),
// so a QR in an email has to be a real hosted image.
//
// Deliberately NOT a general-purpose QR generator: it only encodes URLs that
// pass isAllowedUrl, so nobody can hand out phishing QR codes on our domain.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import QRCode from "qrcode";
import { errorMessage, isAllowedUrl } from "./_auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.d;
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data) return res.status(400).json({ error: "Missing d" });
  if (!isAllowedUrl(data)) return res.status(400).json({ error: "Only Slate links can be encoded" });

  const sizeRaw = Number(Array.isArray(req.query.s) ? req.query.s[0] : req.query.s);
  const size = Math.min(1200, Math.max(120, Number.isFinite(sizeRaw) ? sizeRaw : 320));

  try {
    const png = await QRCode.toBuffer(data, {
      type: "png",
      width: size,
      margin: 2,
      // High correction: these get printed on flyers and photographed off a
      // phone screen at an angle — it needs to survive glare and creases.
      errorCorrectionLevel: "H",
      color: { dark: "#000000ff", light: "#ffffffff" },
    });
    res.setHeader("Content-Type", "image/png");
    // The payload is immutable for a given URL, so let clients cache hard.
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
    res.setHeader("Content-Length", String(png.length));
    return res.status(200).send(png);
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't render QR") });
  }
}
