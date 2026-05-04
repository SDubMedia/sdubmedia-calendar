// ============================================================
// Vercel cron — runs every 30 minutes per vercel.json. Refreshes
// every enabled external calendar. Auth via Bearer CRON_SECRET so
// only Vercel's cron infrastructure can hit it.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { syncExternalCalendar } from "./_externalCalendarSync.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron auth
  const auth = req.headers.authorization || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    // Allow query-param fallback so it can also be triggered manually
    // for debugging: ?key=<CRON_SECRET>
    if (req.query.key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { data: cals } = await supabase
    .from("external_calendars")
    .select("id")
    .eq("enabled", true);

  const results: { id: string; ok: boolean; count?: number; error?: string }[] = [];
  for (const c of (cals || [])) {
    try {
      const r = await syncExternalCalendar(c.id);
      results.push({ id: c.id, ...r });
    } catch (err) {
      results.push({ id: c.id, ok: false, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return res.status(200).json({ count: results.length, results });
}
