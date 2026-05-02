// ============================================================
// Contract Send-Back API — owner rejects an auto-generated draft contract.
//
// Reverts the linked proposal back to "sent" so the client can re-do their
// selections; emails the client with the owner's required reason.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "",
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { contractId, reason } = (req.body || {}) as { contractId?: string; reason?: string };
  if (!contractId) return res.status(400).json({ error: "Missing contractId" });
  if (!reason || !reason.trim()) return res.status(400).json({ error: "Reason required" });

  try {
    const callerOrgId = await getUserOrgId(user.userId);
    if (!callerOrgId) return res.status(403).json({ error: "No organization context" });

    // Load contract — must belong to caller's org and be in draft status.
    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select("id, org_id, proposal_id, title, client_email")
      .eq("id", contractId)
      .single();
    if (cErr || !contract) return res.status(404).json({ error: "Contract not found" });
    if (contract.org_id !== callerOrgId) return res.status(403).json({ error: "Forbidden" });

    const now = new Date().toISOString();

    // 1. Update the contract: void it, store the reason.
    const { error: updErr } = await supabase
      .from("contracts")
      .update({
        status: "void",
        send_back_reason: reason.trim(),
        updated_at: now,
      })
      .eq("id", contractId);
    if (updErr) return res.status(500).json({ error: updErr.message });

    // 2. Revert the linked proposal back to "sent" so the client can re-select.
    if (contract.proposal_id) {
      await supabase
        .from("proposals")
        .update({
          status: "sent",
          accepted_at: null,
          client_signature: null,
          selected_package_id: null,
          pipeline_stage: "proposal_sent",
          updated_at: now,
        })
        .eq("id", contract.proposal_id);
    }

    // 3. Email the client with the owner's reason.
    const clientEmail = contract.client_email;
    if (clientEmail) {
      // Find the client's view URL — proposal's view_token gets them back to the public proposal viewer.
      let viewUrl = "";
      if (contract.proposal_id) {
        const { data: prop } = await supabase
          .from("proposals")
          .select("view_token, org_id")
          .eq("id", contract.proposal_id)
          .single();
        if (prop?.view_token) {
          const allowedHost = process.env.VERCEL_URL || process.env.VITE_APP_URL || "slate.sdubmedia.com";
          viewUrl = `https://${allowedHost}/p/${prop.view_token}`;
        }
      }
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", contract.org_id)
        .single();
      const orgName = org?.name || "your vendor";

      resend.emails.send({
        from: FROM_EMAIL,
        to: clientEmail,
        subject: `Update on your proposal — ${escapeHtml(contract.title || "")}`,
        html: `
<div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e293b;">Update on your proposal</h2>
  <p style="color: #1e293b;">${escapeHtml(orgName)} reviewed your selections for <strong>${escapeHtml(contract.title || "")}</strong> and asked for a quick adjustment before sending the contract.</p>
  <p style="color: #1e293b; margin-top: 16px;"><strong>Note from ${escapeHtml(orgName)}:</strong></p>
  <blockquote style="margin: 8px 0; padding: 12px 16px; background: #f1f5f9; border-left: 3px solid #0088ff; color: #1e293b; white-space: pre-wrap;">${escapeHtml(reason.trim())}</blockquote>
  ${viewUrl ? `<p style="margin-top: 24px;"><a href="${viewUrl}" style="background: #0088ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Review your proposal</a></p>` : ""}
  <p style="color: #64748b; font-size: 13px; margin-top: 24px;">Reply to this email if you have questions.</p>
</div>`,
      }).catch(() => { /* email failure is non-fatal — owner can chase manually */ });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Send-back failed") });
  }
}
