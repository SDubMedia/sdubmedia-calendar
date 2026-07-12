// ============================================================
// Owner nudges one staff member to complete a specific onboarding item — their
// 1099 agreement ("agreement") or their W-9 ("w9") — via push + email. Used by
// the per-name "Send 1099" / "Send W-9" buttons on the Staff page. Owner-only.
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

const COPY: Record<string, { push: string; subject: string; line: string }> = {
  agreement: { push: "Please review and sign your 1099 contractor agreement.", subject: "Please sign your 1099 agreement", line: "Please sign in to Slate to review and sign your 1099 contractor agreement." },
  w9: { push: "Please complete your W-9 in Slate.", subject: "Please complete your W-9", line: "Please sign in to Slate to fill out and sign your W-9." },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { crewMemberId, item } = req.body || {};
    if (!crewMemberId || (item !== "agreement" && item !== "w9")) return res.status(400).json({ error: "crewMemberId + item required" });

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can send this" });
    const orgId = await getUserOrgId(caller.userId);

    const { data: member } = await supabase
      .from("crew_members").select("id, name, email").eq("id", crewMemberId).eq("org_id", orgId).single();
    if (!member) return res.status(404).json({ error: "Staff member not found" });

    const { data: staffProfile } = await supabase
      .from("user_profiles").select("id").eq("crew_member_id", crewMemberId).eq("org_id", orgId).eq("role", "staff").maybeSingle();
    if (!staffProfile) return res.status(400).json({ error: `${member.name} has no login yet — invite them first.` });

    const copy = COPY[item];
    await sendPushToUser(staffProfile.id, { title: "Action needed", body: copy.push, data: { url: "/staff-dashboard" } });

    const email = (member.email || "").trim();
    if (email) {
      try {
        await resend.emails.send({
          from: `Slate <${FROM_EMAIL}>`, to: email, subject: copy.subject,
          html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
            <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml((member.name || "there").split(" ")[0])},</p>
            <p style="font-size:15px;line-height:1.6;">${copy.line}</p>
            <p style="margin:20px 0;"><a href="${APP_URL}" style="background:#0088ff;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Open Slate</a></p>
          </div>`,
        });
      } catch (e) { console.error("notify-staff-item email failed:", e); }
    }

    return res.status(200).json({ ok: true, emailed: !!email });
  } catch (err) {
    console.error("notify-staff-item error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't send the reminder") });
  }
}
