// ============================================================
// Vercel Serverless Function — a BROKER invites one of their own agents.
//
// Privileged non-owner action, so it runs server-side with the service role and
// is tightly scoped: the caller must be a client-role user who owns a
// client_type='broker' record, and the new agent is forced under THAT broker +
// the caller's org. A broker can never create an agent for another brokerage or
// another org.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "crypto";
import { verifyAuth, escapeHtml, isAllowedUrl, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function genPassword(): string {
  // URL-safe-ish, easy to read; user resets on first login anyway.
  return randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) + "7a";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { name, email, phone } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Agent name required" });
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) return res.status(400).json({ error: "A valid agent email is required" });
    const agentName = name.trim();
    const agentEmail = email.trim().toLowerCase();
    const agentPhone = (typeof phone === "string" ? phone : "").replace(/\D/g, "");

    // Caller must be a client-role user who owns a broker record.
    const { data: callerProfile } = await supabase
      .from("user_profiles").select("role, org_id, client_ids").eq("id", caller.userId).single();
    if (!callerProfile || callerProfile.role !== "client") {
      return res.status(403).json({ error: "Only a brokerage account can invite agents" });
    }
    const callerOrgId = callerProfile.org_id;
    const callerClientIds: string[] = Array.isArray(callerProfile.client_ids) ? callerProfile.client_ids : [];
    if (callerClientIds.length === 0) return res.status(403).json({ error: "Your account isn't linked to a brokerage" });

    // Find the broker record the caller owns (must be client_type='broker', same org).
    const { data: brokerRows } = await supabase
      .from("clients").select("id, company, org_id, client_type")
      .in("id", callerClientIds).eq("org_id", callerOrgId).eq("client_type", "broker");
    const broker = (brokerRows || [])[0];
    if (!broker) return res.status(403).json({ error: "Only a brokerage account can invite agents" });

    // 1) Create the agent's client record under THIS broker + org.
    const agentClientId = randomUUID();
    const { error: clientErr } = await supabase.from("clients").insert({
      id: agentClientId,
      org_id: callerOrgId,
      company: agentName,
      contact_name: agentName,
      phone: agentPhone,
      email: agentEmail,
      address: "", city: "", state: "", zip: "",
      billing_model: "per_project",
      billing_rate_per_hour: 0,
      per_project_rate: 0,
      client_type: "agent",
      broker_id: broker.id,
    });
    if (clientErr) return res.status(500).json({ error: errorMessage(clientErr, "Couldn't create the agent record") });

    // 2) Create the auth user (org_id in metadata so the signup trigger stamps it).
    const tempPassword = genPassword();
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email: agentEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: agentName, org_id: callerOrgId, _invited: true },
    });
    if (authErr || !created?.user) {
      // Roll back the orphaned client record so a retry is clean.
      await supabase.from("clients").delete().eq("id", agentClientId);
      return res.status(500).json({ error: errorMessage(authErr, "Couldn't create the login (is the email already in use?)") });
    }

    // 3) Scope the new profile: client role, tied ONLY to this agent record.
    const { error: profErr } = await supabase.from("user_profiles").update({
      name: agentName,
      role: "client",
      org_id: callerOrgId,
      client_ids: [agentClientId],
      must_change_password: true,
    }).eq("id", created.user.id);
    if (profErr) return res.status(500).json({ error: errorMessage(profErr, "Created the login but couldn't finish setup") });

    // 4) Welcome email with login details.
    if (isAllowedUrl(APP_URL)) {
      const safeName = escapeHtml(agentName.split(" ")[0] || "there");
      const safeBroker = escapeHtml(broker.company || "your brokerage");
      const safeEmail = escapeHtml(agentEmail);
      const safePass = escapeHtml(tempPassword);
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b;">
          <h1 style="font-size:24px;font-weight:700;color:#0088ff;margin:0 0 8px;">You're set up to book shoots</h1>
          <p style="font-size:13px;color:#64748b;margin:0 0 24px;">Through ${safeBroker}</p>
          <p style="font-size:15px;line-height:1.6;">Hi ${safeName},</p>
          <p style="font-size:15px;line-height:1.6;">${safeBroker} set you up to view your listings and request photo/video shoots. Your brokerage is billed, so you'll never deal with the money.</p>
          <div style="margin:28px 0;"><a href="${APP_URL}" style="display:inline-block;background:#0088ff;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Sign In</a></div>
          <div style="background:#f1f5f9;border-radius:8px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 12px;font-size:13px;color:#475569;">Your login details:</p>
            <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Email</p>
            <p style="margin:0 0 16px;font-size:14px;font-family:'SF Mono',Monaco,monospace;">${safeEmail}</p>
            <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Temporary Password</p>
            <p style="margin:0 0 12px;font-size:14px;font-family:'SF Mono',Monaco,monospace;">${safePass}</p>
            <p style="margin:0;font-size:12px;color:#64748b;">You'll set your own password on first sign in.</p>
          </div>
        </div>`;
      try {
        await resend.emails.send({ from: `${broker.company || "Slate"} <${FROM_EMAIL}>`, to: agentEmail, subject: `You're set up to book shoots through ${broker.company || "your brokerage"}`, html });
      } catch (e) {
        // Login is created; surface the temp password so the broker can share it manually.
        console.error("Agent invite email failed:", e);
        return res.status(200).json({ ok: true, emailed: false, tempPassword });
      }
    }

    return res.status(200).json({ ok: true, emailed: true });
  } catch (err) {
    console.error("Broker invite agent error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to invite agent") });
  }
}
