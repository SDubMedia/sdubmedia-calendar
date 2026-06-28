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
const APP_STORE_URL = "https://apps.apple.com/app/id6768183675";

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

    // Look up the caller's display name so we can sign the email "from" them
    // (warmer than a faceless system notification).
    const { data: callerRow } = await supabase
      .from("user_profiles")
      .select("name")
      .eq("id", caller.userId)
      .single();
    const callerName = callerRow?.name || "";

    // Look up org name + business info for branding + reply-to.
    const { data: org } = await supabase
      .from("organizations")
      .select("name, business_info")
      .eq("id", callerOrgId)
      .single();
    const orgName = org?.name || "Slate";
    const orgBusinessInfo = (org?.business_info as { email?: string; ownerName?: string } | null) || null;
    const replyToEmail = orgBusinessInfo?.email?.trim() || FROM_EMAIL;
    // Prefer business_info.ownerName when set, else fall back to caller name.
    const senderName = orgBusinessInfo?.ownerName?.trim() || callerName || orgName;

    if (!isAllowedUrl(APP_URL)) {
      return res.status(500).json({ error: "App URL not configured properly" });
    }

    // Role-specific blurb so the email tells them what they'll actually
    // *do* in Slate, not just "you have an account."
    const rolePitch: Record<string, string> = {
      client: "You'll be able to view your project schedule, see photos and videos as soon as they're delivered, and check on invoices anytime — all in one place.",
      partner: "You'll be able to track project progress, view financial summaries for your clients, and stay in the loop on what's coming up.",
      staff: "You'll be able to see your schedule, log your hours, and check your pay — all in one place.",
      family: "You'll have access to the family calendar so we can keep everyone on the same page.",
      owner: "You'll have full access to projects, calendars, finances, and team management.",
    };
    const pitch = rolePitch[target.role] || rolePitch.client;

    // Friendly first name for greeting (falls back to "there" if no name).
    const firstName = (target.name || "").split(" ")[0] || "there";

    const safeFirstName = escapeHtml(firstName);
    const safeEmail = escapeHtml(target.email);
    const safePassword = escapeHtml(tempPassword);
    const safeOrgName = escapeHtml(orgName);
    const safeSenderName = escapeHtml(senderName);
    const safePitch = escapeHtml(pitch);

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1e293b;">
        <h1 style="font-size: 24px; font-weight: 700; color: #0088ff; margin: 0 0 8px;">Welcome aboard</h1>
        <p style="font-size: 13px; color: #64748b; margin: 0 0 24px;">From ${safeSenderName} at ${safeOrgName}</p>

        <p style="font-size: 15px; line-height: 1.6;">Hi ${safeFirstName},</p>
        <p style="font-size: 15px; line-height: 1.6;">I just set up an account for you in our project hub so we can stay organized together.</p>
        <p style="font-size: 15px; line-height: 1.6;">${safePitch}</p>

        <div style="margin: 28px 0;">
          <a href="${APP_URL}" style="display: inline-block; background: #0088ff; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 0 8px 10px 0;">Sign in on the web</a>
          <a href="${APP_STORE_URL}" style="display: inline-block; background: #1e293b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 0 0 10px 0;">Download the iPhone app</a>
          <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">Use the same email &amp; password on the web or the iPhone app.</p>
        </div>

        <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 12px; font-size: 13px; color: #475569;">Your login details:</p>
          <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Email</p>
          <p style="margin: 0 0 16px; font-size: 14px; font-family: 'SF Mono', Monaco, monospace; color: #1e293b;">${safeEmail}</p>
          <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Temporary Password</p>
          <p style="margin: 0 0 12px; font-size: 14px; font-family: 'SF Mono', Monaco, monospace; color: #1e293b;">${safePassword}</p>
          <p style="margin: 0; font-size: 12px; color: #64748b;">You'll be asked to set your own password on first sign in.</p>
        </div>

        <p style="font-size: 15px; line-height: 1.6; margin-top: 24px;">If you have any questions, just reply to this email and it'll come straight to me.</p>

        <p style="font-size: 15px; line-height: 1.6; margin-top: 24px;">— ${safeSenderName}</p>
      </div>
    `;

    const { error: sendError } = await resend.emails.send({
      from: `${orgName} <${FROM_EMAIL}>`,
      replyTo: replyToEmail,
      to: target.email,
      subject: `${senderName} invited you to ${orgName}`,
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
