// ============================================================
// Owner clicks "Send for signature": push a "please review & sign" notification
// to every staff member with a login who hasn't signed the CURRENT agreement
// version yet. Used after editing the agreement so existing staff re-sign.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";
import { sendPushToUser } from "./_apns.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

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

    // Emails for the crew members who still need to sign.
    const toNotify = staffWithCrew.filter(s => !signedSet.has(s.crew_member_id));
    const { data: members } = await supabase
      .from("crew_members").select("id, name, email").in("id", toNotify.map(s => s.crew_member_id));
    const emailById = new Map((members || []).map(m => [m.id, { name: m.name, email: (m.email || "").trim() }]));

    let sent = 0;
    for (const s of toNotify) {
      // Push (app users)…
      await sendPushToUser(s.id, {
        title: "Please review & sign",
        body: "Your company updated the contractor agreement — please review and sign it.",
        data: { url: "/staff-dashboard" },
      });
      // …and email (reliable regardless of the app).
      const m = emailById.get(s.crew_member_id);
      if (m?.email) {
        try {
          await resend.emails.send({
            from: `Slate <${FROM_EMAIL}>`, to: m.email,
            subject: "Please review & sign the updated agreement",
            html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
              <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml((m.name || "there").split(" ")[0])},</p>
              <p style="font-size:15px;line-height:1.6;">Your company updated the contractor agreement. Please sign in to Slate to review and sign it.</p>
              <p style="margin:20px 0;">
                <a href="${APP_URL}" style="background:#0088ff;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Review &amp; sign</a>
              </p>
            </div>`,
          });
        } catch (e) { console.error("agreement email failed:", e); }
      }
      sent++;
    }

    return res.status(200).json({ ok: true, sent });
  } catch (err) {
    console.error("notify-staff-agreement error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to send") });
  }
}
