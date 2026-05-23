// ============================================================
// Send "Contract fully executed" emails to all signers when a
// contract transitions to completed. Called from the EditContractPage
// after the owner countersigns. Each signer gets a link back to the
// public view of their signed copy.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { verifyAuth, getUserOrgId, isAllowedUrl, escapeHtml, errorMessage } from "./_auth.js";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

interface AdditionalSigner {
  id: string;
  name: string;
  email: string;
  role: string;
  signToken: string;
  signedAt: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { contractId, baseUrl, pdfBase64, pdfFilename } = req.body;
  if (!contractId) return res.status(400).json({ error: "Missing contractId" });
  if (!baseUrl || !isAllowedUrl(baseUrl)) return res.status(400).json({ error: "Invalid baseUrl" });
  // Sanity-check the PDF if provided. Resend's max attachment size is ~40MB;
  // typical contracts are well under 1MB. Reject anything obviously huge so
  // bad inputs don't tip us into a Resend error.
  const hasPdf = typeof pdfBase64 === "string" && pdfBase64.length > 0;
  if (hasPdf && pdfBase64.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: "PDF too large" });
  }
  const safeFilename = (typeof pdfFilename === "string" && /^[\w\s.-]+$/.test(pdfFilename))
    ? pdfFilename
    : "contract-signed.pdf";

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // IDOR guard — caller must belong to the contract's org.
    const callerOrgId = await getUserOrgId(user.userId);
    if (!callerOrgId) return res.status(403).json({ error: "No org" });

    const { data: contract } = await supabase
      .from("contracts")
      .select("id, org_id, title, client_email, sign_token, additional_signers, status")
      .eq("id", contractId)
      .single();
    if (!contract) return res.status(404).json({ error: "Contract not found" });
    if (contract.org_id !== callerOrgId) return res.status(403).json({ error: "Not your contract" });
    if (contract.status !== "completed") return res.status(400).json({ error: "Contract not completed" });

    const { data: org } = await supabase.from("organizations").select("name").eq("id", contract.org_id).single();
    const orgName = org?.name || "Your production company";

    const { data: ownerProfile } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("org_id", contract.org_id)
      .eq("role", "owner")
      .limit(1);
    const ownerEmail = (ownerProfile?.[0]?.email as string) || "";

    // Build recipient list: primary client + additional signers + owner.
    const recipients: { to: string; signToken: string }[] = [];
    if (contract.client_email) {
      recipients.push({ to: contract.client_email as string, signToken: contract.sign_token as string });
    }
    for (const s of (contract.additional_signers as AdditionalSigner[] | null) || []) {
      if (s.email) recipients.push({ to: s.email, signToken: s.signToken });
    }
    if (ownerEmail) {
      // Owner gets the primary token URL (renders the same completed view).
      recipients.push({ to: ownerEmail, signToken: contract.sign_token as string });
    }

    let sent = 0;
    for (const r of recipients) {
      const viewUrl = `${baseUrl.replace(/\/$/, "")}/sign/${r.signToken}`;
      if (!isAllowedUrl(viewUrl)) continue;
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: r.to,
          subject: `✅ Contract executed: ${contract.title}`,
          html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="color:#0088ff;font-size:24px;margin:0;">SLATE</h1>
              <p style="color:#64748b;font-size:12px;margin-top:4px;">${escapeHtml(orgName)}</p>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:32px;text-align:center;">
              <h2 style="color:#15803d;font-size:20px;margin:0 0 8px;">Contract fully executed</h2>
              <p style="color:#1e293b;font-size:14px;margin:0 0 24px;">All parties have signed <strong>${escapeHtml(contract.title as string)}</strong>.${hasPdf ? " A signed PDF is attached for your records." : ""} You can also view the contract online below.</p>
              <a href="${escapeHtml(viewUrl)}" style="display:inline-block;padding:12px 28px;background:#15803d;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View Signed Contract</a>
            </div>
            <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:24px;">Save this email for your records. Sent via Slate by ${escapeHtml(orgName)}.</p>
          </div>`,
          ...(hasPdf ? { attachments: [{ filename: safeFilename, content: pdfBase64 }] } : {}),
        });
        sent++;
      } catch { /* swallow per-recipient — try the rest */ }
    }

    return res.status(200).json({ ok: true, recipients: recipients.length, sent });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to send completion email") });
  }
}
