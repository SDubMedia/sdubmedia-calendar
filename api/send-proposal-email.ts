// ============================================================
// Send proposal email via Resend
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { verifyAuth, isAllowedUrl, escapeHtml } from "./_auth";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { to, cc, subject, proposalUrl, proposalTitle, total, paymentOption, depositPercent, orgName } = req.body;
  if (!to || !proposalUrl) return res.status(400).json({ error: "Missing to or proposalUrl" });
  if (!isAllowedUrl(proposalUrl)) return res.status(400).json({ error: "Invalid proposal URL" });
  const safeProposalUrl = escapeHtml(proposalUrl);

  // Escape HTML to prevent injection
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const paymentText = paymentOption === "full"
    ? `<p style="color: #1e293b; font-size: 16px; margin: 0 0 8px;"><strong>Total: $${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p><p style="color: #64748b; font-size: 13px; margin: 0 0 24px;">Full payment required at signing</p>`
    : paymentOption === "deposit"
    ? `<p style="color: #1e293b; font-size: 16px; margin: 0 0 8px;"><strong>Total: $${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p><p style="color: #64748b; font-size: 13px; margin: 0 0 24px;">Deposit of ${depositPercent}% due at signing</p>`
    : `<p style="color: #1e293b; font-size: 16px; margin: 0 0 24px;"><strong>Total: $${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      ...(cc ? { cc } : {}),
      subject: subject || `Proposal: ${proposalTitle}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #0088ff; font-size: 24px; margin: 0;">SLATE</h1>
            <p style="color: #64748b; font-size: 12px; margin-top: 4px;">${esc(orgName)}</p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
            <h2 style="color: #1e293b; font-size: 20px; margin: 0 0 8px;">You have a proposal to review</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 16px;">
              <strong>${esc(orgName)}</strong> has sent you a proposal:<br/>
              <strong style="color: #1e293b;">${esc(proposalTitle) || "Proposal"}</strong>
            </p>

            ${paymentText}

            <a href="${safeProposalUrl}" style="display: inline-block; padding: 14px 32px; background: #0088ff; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Review & Accept Proposal
            </a>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
              Or open this link in your browser:<br/>
              <a href="${safeProposalUrl}" style="color: #0088ff; word-break: break-all;">${safeProposalUrl}</a>
            </p>
          </div>

          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 24px;">
            Sent via Slate by ${esc(orgName)}
          </p>
        </div>
      `,
    });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to send email" });
  }
}
