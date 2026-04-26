// ============================================================
// Vercel Serverless Function — Send welcome/invite email to new user
// Owner can invite a newly created user with their login details
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, escapeHtml, isAllowedUrl, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const caller = await verifyAuth(req);
  if (!caller) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { userId, tempPassword } = req.body || {};
    if (!userId || !tempPassword) {
      return res.status(400).json({ error: "userId and tempPassword required" });
    }

    // Verify caller is an owner
    const { data: callerProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", caller.userId)
      .single();
    if (!callerProfile || callerProfile.role !== "owner") {
      return res.status(403).json({ error: "Only owners can send invites" });
    }

    // Verify target is in same org
    const callerOrgId = await getUserOrgId(caller.userId);
    const targetOrgId = await getUserOrgId(userId);
    if (!callerOrgId || callerOrgId !== targetOrgId) {
      return res.status(403).json({ error: "Cannot invite users outside your organization" });
    }

    // Look up target user
    const { data: target, error: targetErr } = await supabase
      .from("user_profiles")
      .select("name, email, role")
      .eq("id", userId)
      .single();
    if (targetErr || !target) {
      return res.status(404).json({ error: "User not found" });
    }

    // Look up org name for the email body
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", callerOrgId)
      .single();
    const orgName = org?.name || "Slate";

    if (!isAllowedUrl(APP_URL)) {
      return res.status(500).json({ error: "App URL not configured properly" });
    }

    const safeName = escapeHtml(target.name || "there");
    const safeEmail = escapeHtml(target.email);
    const safePassword = escapeHtml(tempPassword);
    const safeOrgName = escapeHtml(orgName);
    const safeRole = escapeHtml(target.role);

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1e293b;">
        <h1 style="font-size: 24px; font-weight: 700; color: #0088ff; margin: 0 0 8px;">Welcome to Slate</h1>
        <p style="font-size: 13px; color: #64748b; margin: 0 0 24px;">By ${safeOrgName}</p>

        <p style="font-size: 15px; line-height: 1.6;">Hi ${safeName},</p>
        <p style="font-size: 15px; line-height: 1.6;">An account has been created for you on Slate as a <strong>${safeRole}</strong>. You can sign in using the credentials below.</p>

        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Email</p>
          <p style="margin: 0 0 16px; font-size: 14px; font-family: 'SF Mono', Monaco, monospace; color: #1e293b;">${safeEmail}</p>
          <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Temporary Password</p>
          <p style="margin: 0; font-size: 14px; font-family: 'SF Mono', Monaco, monospace; color: #1e293b;">${safePassword}</p>
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #64748b;">You'll be asked to set a new password the first time you log in.</p>

        <div style="margin: 32px 0;">
          <a href="${APP_URL}" style="display: inline-block; background: #0088ff; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Sign In to Slate</a>
        </div>

        <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 32px;">
          If you weren't expecting this email, you can safely ignore it.
        </p>
      </div>
    `;

    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: target.email,
      subject: `You've been invited to Slate by ${orgName}`,
      html,
    });

    if (sendError) {
      return res.status(500).json({ error: sendError.message || "Failed to send email" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Invite user error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to send invite") });
  }
}
