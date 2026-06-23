// ============================================================
// Vercel Serverless Function — the assigned shooter is "on my way".
//
// Stamps projects.on_the_way_at (locks the agent out of changing/cancelling)
// and notifies the agent by email + push. Caller must be the owner or a crew
// member assigned to the shoot. The 1-hour-before window is enforced client-side
// (device-local time); this trusts the authorized shooter.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";
import { sendPushToUser } from "./_apns.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { projectId } = req.body || {};
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const callerOrgId = await getUserOrgId(caller.userId);

    const { data: callerProfile } = await supabase.from("user_profiles").select("role, crew_member_id").eq("id", caller.userId).single();
    if (!callerProfile) return res.status(403).json({ error: "No profile" });

    const { data: project } = await supabase
      .from("projects").select("id, org_id, client_id, location_id, crew, on_the_way_at").eq("id", projectId).maybeSingle();
    if (!project || project.org_id !== callerOrgId) return res.status(404).json({ error: "Shoot not found" });

    // Caller must be the owner or assigned crew on this shoot.
    const crew = Array.isArray(project.crew) ? project.crew : [];
    const isAssigned = !!callerProfile.crew_member_id && crew.some((c: { crewMemberId?: string }) => c.crewMemberId === callerProfile.crew_member_id);
    if (callerProfile.role !== "owner" && !isAssigned) return res.status(403).json({ error: "Only the assigned shooter can do this" });

    const nowIso = new Date().toISOString();
    if (!project.on_the_way_at) {
      await supabase.from("projects").update({ on_the_way_at: nowIso, updated_at: nowIso }).eq("id", projectId);
    }

    // Notify the agent (the project's client): email + push.
    const { data: agent } = await supabase.from("clients").select("id, company, contact_name, email").eq("id", project.client_id).maybeSingle();
    const { data: loc } = project.location_id ? await supabase.from("locations").select("name").eq("id", project.location_id).maybeSingle() : { data: null };
    const propertyName = loc?.name || "your listing";

    let toEmail = (agent?.email || "").trim();
    let agentUserId = "";
    if (agent) {
      const { data: profiles } = await supabase.from("user_profiles").select("id, email, client_ids").eq("org_id", callerOrgId);
      const attached = (profiles || []).find(p => Array.isArray(p.client_ids) && p.client_ids.includes(agent.id));
      if (attached) { agentUserId = attached.id; if (!toEmail) toEmail = (attached.email || "").trim(); }
    }
    const firstName = (agent?.contact_name || agent?.company || "there").split(" ")[0];

    let emailed = false;
    if (toEmail) {
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b;">
          <h1 style="font-size:22px;font-weight:700;color:#0088ff;margin:0 0 12px;">Your photographer is on the way</h1>
          <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:15px;line-height:1.6;">Your photographer is heading to <strong>${escapeHtml(propertyName)}</strong> now. You can no longer change or cancel this shoot.</p>
        </div>`;
      try { await resend.emails.send({ from: `Slate <${FROM_EMAIL}>`, to: toEmail, subject: `Your photographer is on the way — ${propertyName}`, html }); emailed = true; }
      catch (e) { console.error("On-the-way email failed:", e); }
    }

    let pushed = 0;
    if (agentUserId) {
      try {
        const r = await sendPushToUser(agentUserId, { title: "Photographer on the way", body: `Heading to ${propertyName} now`, data: { url: "/my-houses" } });
        pushed = r.sent;
      } catch (e) { console.error("On-the-way push failed:", e); }
    }

    return res.status(200).json({ ok: true, onTheWayAt: project.on_the_way_at || nowIso, emailed, pushed });
  } catch (err) {
    console.error("notify-on-the-way error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to send") });
  }
}
