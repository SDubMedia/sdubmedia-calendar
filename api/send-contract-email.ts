// ============================================================
// Send contract signing email via Resend
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, isAllowedUrl, escapeHtml, errorMessage } from "./_auth.js";
import { emailFooter } from "./_emailBranding.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const { to, cc, subject, signUrl, contractTitle, orgName } = req.body;
  if (!to || !signUrl) return res.status(400).json({ error: "Missing to or signUrl" });
  if (!isAllowedUrl(signUrl)) return res.status(400).json({ error: "Invalid sign URL" });
  const safeSignUrl = escapeHtml(signUrl);

  // Resolve the org's business email so we can use it as reply-to. Reply-to
  // routes the client's questions back to the contractor, not Slate.
  // Display name uses orgName (passed in by the caller). Same pattern as
  // payment-reminders + event-reminders + receipt emails for consistency
  // across all client-facing transactional mail.
  let replyToEmail = FROM_EMAIL;
  // Fetch the org's full business info so we can render the branded footer
  // with company address, phone, email, website at the bottom of the email.
  let orgBusinessInfo: { email?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string; website?: string } | null = null;
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const callerOrgId = await getUserOrgId(user.userId);
      if (callerOrgId) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: org } = await supabase
          .from("organizations")
          .select("business_info")
          .eq("id", callerOrgId)
          .single();
        orgBusinessInfo = (org?.business_info as typeof orgBusinessInfo) || null;
        if (orgBusinessInfo?.email?.trim()) replyToEmail = orgBusinessInfo.email.trim();
      }
    } catch { /* best-effort — fall back to FROM_EMAIL */ }
  }

  const fromHeader = orgName ? `${orgName} <${FROM_EMAIL}>` : FROM_EMAIL;
  const brandedFooter = emailFooter({ orgName, businessInfo: orgBusinessInfo });

  try {
    const { error } = await resend.emails.send({
      from: fromHeader,
      replyTo: replyToEmail,
      to,
      ...(cc ? { cc } : {}),
      subject: subject || `Contract: ${esc(contractTitle)}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #0088ff; font-size: 24px; margin: 0;">SLATE</h1>
            <p style="color: #64748b; font-size: 12px; margin-top: 4px;">${esc(orgName)}</p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
            <h2 style="color: #1e293b; font-size: 20px; margin: 0 0 8px;">You have a contract to sign</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 24px;">
              <strong>${esc(orgName)}</strong> has sent you a contract:<br/>
              <strong style="color: #1e293b;">${esc(contractTitle)}</strong>
            </p>

            <a href="${safeSignUrl}" style="display: inline-block; padding: 14px 32px; background: #0088ff; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Review & Sign Contract
            </a>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
              Or open this link in your browser:<br/>
              <a href="${safeSignUrl}" style="color: #0088ff; word-break: break-all;">${safeSignUrl}</a>
            </p>
          </div>

          ${brandedFooter}

          <p style="color: #cbd5e1; font-size: 10px; text-align: center; margin-top: 12px;">
            Sent via Slate
          </p>
        </div>
      `,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to send email") });
  }
}
