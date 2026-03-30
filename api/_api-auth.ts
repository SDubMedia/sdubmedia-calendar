// ============================================================
// API key auth for external integrations (Claude AI, etc.)
// Validates X-API-Key header against SLATE_API_KEY env var
// ============================================================

import type { VercelRequest } from "@vercel/node";

export function verifyApiKey(req: VercelRequest): boolean {
  const key = req.headers["x-api-key"];
  const expected = process.env.SLATE_API_KEY;
  if (!expected) return false;
  return key === expected;
}
