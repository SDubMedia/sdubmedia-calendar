// ============================================================
// Owner disconnects Google Drive — clears the stored refresh token, folder id,
// and connected email from the org. Owner-only.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can disconnect Google Drive" });
    const orgId = await getUserOrgId(caller.userId);

    const { error } = await supabase.from("organizations").update({
      google_drive_refresh_token: "", google_drive_folder_id: "", google_drive_email: "",
    }).eq("id", orgId);
    if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't disconnect") });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("google-drive-disconnect error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't disconnect") });
  }
}
