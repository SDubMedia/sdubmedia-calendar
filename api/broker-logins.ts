// ============================================================
// Vercel Serverless Function — manage a brokerage's managing-broker logins.
//
// A brokerage (clients.client_type='broker') can have multiple managing-broker
// logins. Each is a client-role user_profile whose client_ids includes the
// brokerage id, so they all share the exact same broker view (agents, bookings,
// notifications) via the existing scoping + RLS.
//
// Owner-only. Actions (in body): list | add | remove | resend | set-principal.
// Every action is scoped to a brokerage the caller owns, and every target user
// is verified to actually be a managing broker of THAT brokerage (IDOR guard).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { Resend } from "resend";
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

interface Brokerage {
  id: string;
  company: string;
  org_id: string;
  client_type: string;
  principal_broker_user_id: string | null;
}

// Emails a managing broker their credentials (best-effort). Returns whether it sent.
async function emailCredentials(
  email: string, name: string, tempPassword: string, brokerCompany: string, isReset: boolean,
): Promise<boolean> {
  if (!isAllowedUrl(APP_URL)) return false;
  const firstName = (name || "there").split(" ")[0];
  const heading = isReset ? "Your Slate password was reset" : "You're set up on Slate";
  const body = isReset
    ? "Here's a new temporary password to get back in."
    : `You've been added as a managing broker for ${escapeHtml(brokerCompany)}. You can view your agents, their shoots, and your billing — and you'll be notified when projects are delivered.`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b;">
      <h1 style="font-size:24px;font-weight:700;color:#0088ff;margin:0 0 8px;">${heading}</h1>
      <p style="font-size:13px;color:#64748b;margin:0 0 24px;">${escapeHtml(brokerCompany)}</p>
      <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
      <p style="font-size:15px;line-height:1.6;">${body}</p>
      <div style="margin:28px 0;">
        <a href="${APP_URL}" style="display:inline-block;background:#0088ff;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:0 8px 10px 0;">Sign in on the web</a>
        <a href="https://apps.apple.com/app/id6768183675" style="display:inline-block;background:#1e293b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:0 0 10px 0;">Download the iPhone app</a>
        <p style="margin:6px 0 0;font-size:12px;color:#64748b;">Use the same email &amp; password on the web or the iPhone app.</p>
      </div>
      <div style="background:#f1f5f9;border-radius:8px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Email</p>
        <p style="margin:0 0 16px;font-size:14px;font-family:'SF Mono',Monaco,monospace;">${escapeHtml(email)}</p>
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">Temporary Password</p>
        <p style="margin:0 0 12px;font-size:14px;font-family:'SF Mono',Monaco,monospace;">${escapeHtml(tempPassword)}</p>
        <p style="margin:0;font-size:12px;color:#64748b;">You'll set your own password on first sign in.</p>
      </div>
    </div>`;
  try {
    await resend.emails.send({
      from: `Slate <${FROM_EMAIL}>`,
      to: email,
      subject: isReset ? "Your Slate password was reset" : `You're set up on Slate — ${brokerCompany}`,
      html,
    });
    return true;
  } catch (e) {
    console.error("broker-logins email failed:", e);
    return false;
  }
}

// Fetch a target profile and confirm it's a managing broker of this brokerage.
async function requireManagingBroker(userId: string, broker: Brokerage) {
  const { data: p } = await supabase
    .from("user_profiles")
    .select("id, org_id, role, client_ids")
    .eq("id", userId)
    .maybeSingle<{ id: string; org_id: string; role: string; client_ids: string[] }>();
  const ok = p && p.org_id === broker.org_id && p.role === "client"
    && Array.isArray(p.client_ids) && p.client_ids.includes(broker.id);
  return ok ? p : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const { data: callerProfile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
  if (!callerProfile || callerProfile.role !== "owner") {
    return res.status(403).json({ error: "Only owners can manage broker logins" });
  }
  const orgId = await getUserOrgId(caller.userId);
  if (!orgId) return res.status(400).json({ error: "No organization for caller" });

  const { action, brokerId } = req.body || {};
  if (!brokerId) return res.status(400).json({ error: "brokerId required" });

  const { data: broker } = await supabase
    .from("clients")
    .select("id, company, org_id, client_type, principal_broker_user_id")
    .eq("id", brokerId)
    .maybeSingle<Brokerage>();
  if (!broker || broker.org_id !== orgId || broker.client_type !== "broker") {
    return res.status(404).json({ error: "Brokerage not found" });
  }

  try {
    switch (action) {
      case "list": {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id, name, email, must_change_password")
          .eq("org_id", broker.org_id)
          .eq("role", "client")
          .contains("client_ids", [broker.id]);
        const logins = (profiles || []).map((p) => ({
          id: p.id,
          name: p.name || "",
          email: p.email || "",
          mustChangePassword: p.must_change_password === true,
          isPrincipal: broker.principal_broker_user_id === p.id,
        }));
        return res.status(200).json({ ok: true, logins });
      }

      case "add": {
        const rawEmail = (req.body.email || "").trim().toLowerCase();
        const name = (req.body.name || "").trim() || broker.company;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
          return res.status(400).json({ error: "Enter a valid email" });
        }
        const tempPassword = genPassword();
        const { data: created, error: authErr } = await supabase.auth.admin.createUser({
          email: rawEmail, password: tempPassword, email_confirm: true,
          user_metadata: { name, org_id: orgId, _invited: true },
        });
        if (authErr || !created?.user) {
          return res.status(400).json({ error: errorMessage(authErr, "Couldn't create the login (is the email already in use?)") });
        }
        const { error: profErr } = await supabase.from("user_profiles").update({
          name, role: "client", org_id: orgId, client_ids: [broker.id], must_change_password: true,
        }).eq("id", created.user.id);
        if (profErr) return res.status(500).json({ error: errorMessage(profErr, "Created the login but couldn't finish setup") });

        const emailed = await emailCredentials(rawEmail, name, tempPassword, broker.company, false);
        return res.status(200).json({ ok: true, userId: created.user.id, tempPassword, emailed });
      }

      case "resend": {
        const userId = req.body.userId;
        if (!userId) return res.status(400).json({ error: "userId required" });
        const target = await requireManagingBroker(userId, broker);
        if (!target) return res.status(404).json({ error: "Not a managing broker of this brokerage" });
        const tempPassword = genPassword();
        const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, { password: tempPassword });
        if (pwErr) return res.status(500).json({ error: errorMessage(pwErr, "Couldn't reset the password") });
        await supabase.from("user_profiles").update({ must_change_password: true }).eq("id", userId);
        const { data: prof } = await supabase.from("user_profiles").select("name, email").eq("id", userId).single();
        const emailed = await emailCredentials(prof?.email || "", prof?.name || "", tempPassword, broker.company, true);
        return res.status(200).json({ ok: true, tempPassword, emailed });
      }

      case "remove": {
        const userId = req.body.userId;
        if (!userId) return res.status(400).json({ error: "userId required" });
        const target = await requireManagingBroker(userId, broker);
        if (!target) return res.status(404).json({ error: "Not a managing broker of this brokerage" });
        await supabase.from("user_profiles").delete().eq("id", userId);
        await supabase.auth.admin.deleteUser(userId);
        if (broker.principal_broker_user_id === userId) {
          await supabase.from("clients").update({ principal_broker_user_id: null }).eq("id", broker.id);
        }
        return res.status(200).json({ ok: true });
      }

      case "set-principal": {
        const userId = req.body.userId ?? null;
        if (userId) {
          const target = await requireManagingBroker(userId, broker);
          if (!target) return res.status(404).json({ error: "Not a managing broker of this brokerage" });
        }
        const { error } = await supabase.from("clients").update({ principal_broker_user_id: userId }).eq("id", broker.id);
        if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't set the principal") });
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    console.error("broker-logins error:", err);
    return res.status(500).json({ error: errorMessage(err, "Broker login action failed") });
  }
}
