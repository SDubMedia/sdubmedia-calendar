// ============================================================
// Owner adds a new external calendar feed. We:
//   1. Validate they're an owner
//   2. Insert the calendar row
//   3. Run the first sync inline so the owner sees events immediately
//      (or sees the error if the URL is bogus)
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

  const { label, url, color } = req.body || {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "Missing url" });
  if (url.length > 2000) return res.status(400).json({ error: "URL too long" });
  // Accept webcal://, https://, http://. Anything else (file://, ftp://, etc.) is rejected.
  if (!/^(webcal|https?):\/\//i.test(url)) {
    return res.status(400).json({ error: "URL must start with webcal://, https://, or http://" });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("org_id, role")
    .eq("id", user.userId)
    .single();
  if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Owner only" });

  const id = `xcal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { error: insErr } = await supabase.from("external_calendars").insert({
      id,
      org_id: profile.org_id,
      owner_user_id: user.userId,
      label: (label || "External calendar").slice(0, 200),
      url: url.trim(),
      color: typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#94a3b8",
      enabled: true,
    });
    if (insErr) throw new Error(insErr.message);

    // First sync inline. If it fails, the calendar row stays but
    // last_error gets populated so the UI can surface it.
    const syncResult = await syncExternalCalendar(id);
    return res.status(200).json({ id, syncResult });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to add calendar") });
  }
}
