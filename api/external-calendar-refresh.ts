// ============================================================
// Owner-triggered manual refresh of one external calendar.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, errorMessage } from "./_auth.js";
import { syncExternalCalendar } from "./_externalCalendarSync.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { externalCalendarId } = req.body || {};
  if (!externalCalendarId) return res.status(400).json({ error: "Missing externalCalendarId" });

  const { data: cal } = await supabase
    .from("external_calendars")
    .select("owner_user_id")
    .eq("id", externalCalendarId)
    .single();
  if (!cal || cal.owner_user_id !== user.userId) return res.status(403).json({ error: "Not yours" });

  try {
    const result = await syncExternalCalendar(externalCalendarId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Refresh failed") });
  }
}
