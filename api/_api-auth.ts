// ============================================================
// API key auth for external integrations (Claude AI, etc.)
// Validates X-API-Key header against SLATE_API_KEY env var
// ============================================================

import type { VercelRequest } from "@vercel/node";

export function verifyApiKey(req: VercelRequest): boolean {
  const key = req.headers["x-api-key"] as string | undefined;
  const expected = process.env.SLATE_API_KEY;
  if (!expected || !key || key.length !== expected.length) return false;
  const { timingSafeEqual } = require("crypto");
  return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}
