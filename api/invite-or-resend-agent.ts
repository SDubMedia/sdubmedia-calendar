// ============================================================
// Vercel Serverless Function — owner invites an existing agent to log in, or
// resends them a fresh temporary password.
//
// One endpoint, two states (decided by whether the agent already has a login):
//  - no login  → create the auth user + client-scoped profile, email a temp pw.
//  - has login → reset to a new temp pw (force change), email it.
// Owner-only; the agent must be a client record in the caller's org.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { verifyAuth, getUserOrgId, escapeHtml, isAllowedUrl, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

function genPassword(): string {
  return randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) + "7a";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { agentClientId } = req.body || {};
    if (!agentClientId) return res.status(400).json({ error: "agentClientId required" });

    const { data: callerProfile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!callerProfile || callerProfile.role !== "owner") return res.status(403).json({ error: "Only owners can invite agents" });
    const orgId = await getUserOrgId(caller.userId);

    const { data: agent } = await supabase
      .from("clients").select("id, company, contact_name, email, broker_id, client_type")
      .eq("id", agentClientId).eq("org_id", orgId).maybeSingle();
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    const agentEmail = (agent.email || "").trim().toLowerCase();
    if (!agentEmail) return res.status(400).json({ error: "This agent has no email on file — add one first." });

    const isBroker = agent.client_type === "broker";
    const { data: broker } = agent.broker_id
      ? await supabase.from("clients").select("company").eq("id", agent.broker_id).maybeSingle()
      : { data: null };
    const brokerName = broker?.company || "your brokerage";
    const agentName = agent.company || agent.contact_name || "there";
    const firstName = agentName.split(" ")[0];
    const tempPassword = genPassword();

    // Already has a login? Find the profile scoped to this agent.
    const { data: profiles } = await supabase.from("user_profiles").select("id, client_ids, role").eq("org_id", orgId);
    const existing = (profiles || []).find(p => p.role === "client" && Array.isArray(p.client_ids) && p.client_ids.includes(agentClientId));

    let action: "invited" | "resent";
    if (existing) {
      const { error: pwErr } = await supabase.auth.admin.updateUserById(existing.id, { password: tempPassword });
      if (pwErr) return res.status(500).json({ error: errorMessage(pwErr, "Couldn't reset the password") });
      await supabase.from("user_profiles").update({ must_change_password: true }).eq("id", existing.id);
      action = "resent";
    } else {
      const { data: created, error: authErr } = await supabase.auth.admin.createUser({
        email: agentEmail, password: tempPassword, email_confirm: true,
        user_metadata: { name: agentName, org_id: orgId, _invited: true },
      });
      if (authErr || !created?.user) return res.status(500).json({ error: errorMessage(authErr, "Couldn't create the login (is the email already in use?)") });
      const { error: profErr } = await supabase.from("user_profiles").update({
        name: agentName, role: "client", org_id: orgId, client_ids: [agentClientId], must_change_password: true,
      }).eq("id", created.user.id);
      if (profErr) return res.status(500).json({ error: errorMessage(profErr, "Created the login but couldn't finish setup") });
      action = "invited";
    }

    // Email the credentials (best-effort — surface the temp pw if it fails).
    if (isAllowedUrl(APP_URL)) {
      const invitedHeading = isBroker ? "You're set up on Slate" : "You're set up to book shoots";
      const heading = action === "invited" ? invitedHeading : "Your Slate password was reset";
      const invitedBody = isBroker
        ? "You can now sign in to view your agents' shoots, your monthly billing, and your invoices."
        : `${escapeHtml(brokerName)} set you up to view your listings and request photo/video shoots.`;
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b;">
          <h1 style="font-size:24px;font-weight:700;color:#0088ff;margin:0 0 8px;">${heading}</h1>
          ${isBroker ? "" : `<p style="font-size:13px;color:#64748b;margin:0 0 24px;">Through ${escapeHtml(brokerName)}</p>`}
          <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:15px;line-height:1.6;">${action === "invited" ? invitedBody : "Here's a new temporary password to get back in."}</p>
          <div style="margin:28px 0;">
            <a href="${APP_URL}" style="display:inline-block;background:#0088ff;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:0 8px 10px 0;">Sign in on the web</a>
            <a href="https://apps.apple.com/app/id6768183675" style="display:inline-block;background:#1e293b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:0 0 10px 0;">Download the iPhone app</a>
            <p style="margin:6px 0 0;font-size:12px;color:#64748b;">Use the same email &amp; password on the web or the iPhone app.</p>
          </div>
          <div style="background:#f1f5f9;border-radius:8px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Email</p>
            <p style="margin:0 0 16px;font-size:14px;font-family:'SF Mono',Monaco,monospace;">${escapeHtml(agentEmail)}</p>
            <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Temporary Password</p>
            <p style="margin:0 0 12px;font-size:14px;font-family:'SF Mono',Monaco,monospace;">${escapeHtml(tempPassword)}</p>
            <p style="margin:0;font-size:12px;color:#64748b;">You'll set your own password on first sign in.</p>
          </div>
        </div>`;
      try {
        await resend.emails.send({ from: `Slate <${FROM_EMAIL}>`, to: agentEmail, subject: action === "invited" ? invitedHeading : `Your Slate password was reset`, html });
        return res.status(200).json({ ok: true, action, emailed: true, tempPassword });
      } catch (e) {
        console.error("invite/resend email failed:", e);
        return res.status(200).json({ ok: true, action, emailed: false, tempPassword });
      }
    }
    return res.status(200).json({ ok: true, action, emailed: false, tempPassword });
  } catch (err) {
    console.error("invite-or-resend-agent error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to invite the agent") });
  }
}
