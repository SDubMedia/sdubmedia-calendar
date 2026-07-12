// ============================================================
// Owner clicks "Send for signature": push a "please review & sign" notification
// to every staff member with a login who hasn't signed the CURRENT agreement
// version yet. Used after editing the agreement so existing staff re-sign.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { sendPushToUser } from "./_apns.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { version } = req.body || {};
    if (!version || typeof version !== "string") return res.status(400).json({ error: "version required" });

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can send this" });
    const orgId = await getUserOrgId(caller.userId);

    // Staff logins in this org (each linked to a crew member).
    const { data: staff } = await supabase
      .from("user_profiles").select("id, crew_member_id").eq("org_id", orgId).eq("role", "staff");
    const staffWithCrew = (staff || []).filter(s => s.crew_member_id);
    if (staffWithCrew.length === 0) return res.status(200).json({ ok: true, sent: 0 });

    // Who already signed the current version?
    const crewIds = staffWithCrew.map(s => s.crew_member_id);
    const { data: signed } = await supabase
      .from("staff_agreements").select("crew_member_id")
      .eq("org_id", orgId).eq("agreement_version", version).not("staff_signed_at", "is", null).in("crew_member_id", crewIds);
    const signedSet = new Set((signed || []).map(r => r.crew_member_id));

    let sent = 0;
    for (const s of staffWithCrew) {
      if (signedSet.has(s.crew_member_id)) continue;
      await sendPushToUser(s.id, {
        title: "Please review & sign",
        body: "Your company updated the contractor agreement — please review and sign it.",
        data: { url: "/staff-dashboard" },
      });
      sent++;
    }

    return res.status(200).json({ ok: true, sent });
  } catch (err) {
    console.error("notify-staff-agreement error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to send") });
  }
}
