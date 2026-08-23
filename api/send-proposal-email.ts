// ============================================================
// Send proposal email via Resend
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

  const { to, cc, subject, proposalUrl, proposalTitle, total, paymentOption, depositPercent, orgName, kind, proposalId } = req.body;

  // kind=documents: re-send the SIGNED packet (agreement + invoices) for an
  // accepted proposal. Links are built server-side from the caller's own org
  // so a forged body can't email another org's documents.
  if (kind === "documents") {
    return await sendSignedDocuments(res, user.userId, String(proposalId || ""), typeof cc === "string" ? cc : "");
  }

  if (!to || !proposalUrl) return res.status(400).json({ error: "Missing to or proposalUrl" });
  if (!isAllowedUrl(proposalUrl)) return res.status(400).json({ error: "Invalid proposal URL" });
  const safeProposalUrl = escapeHtml(proposalUrl);

  // Resolve reply-to + full business info from the org so we can render
  // the branded footer with address / phone / email at the bottom.
  let replyToEmail = FROM_EMAIL;
  // Named, not `typeof orgBusinessInfo` at the cast site: by that line the
  // variable is narrowed to `null`, which erased the shape and made every
  // field read after it an error.
  type OrgBusinessInfo = { email?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string; website?: string };
  let orgBusinessInfo: OrgBusinessInfo | null = null;
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const callerOrgId = await getUserOrgId(user.userId);
      if (callerOrgId) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: org } = await supabase.from("organizations").select("business_info").eq("id", callerOrgId).single();
        orgBusinessInfo = (org?.business_info as OrgBusinessInfo | null) || null;
        if (orgBusinessInfo?.email?.trim()) replyToEmail = orgBusinessInfo.email.trim();
      }
    } catch { /* fall back to FROM_EMAIL */ }
  }
  const fromHeader = orgName ? `${orgName} <${FROM_EMAIL}>` : FROM_EMAIL;
  const brandedFooter = emailFooter({ orgName, businessInfo: orgBusinessInfo });

  // Escape HTML to prevent injection
  const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const paymentText = paymentOption === "full"
    ? `<p style="color: #1e293b; font-size: 16px; margin: 0 0 8px;"><strong>Total: $${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p><p style="color: #64748b; font-size: 13px; margin: 0 0 24px;">Full payment required at signing</p>`
    : paymentOption === "deposit"
    ? `<p style="color: #1e293b; font-size: 16px; margin: 0 0 8px;"><strong>Total: $${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p><p style="color: #64748b; font-size: 13px; margin: 0 0 24px;">Deposit of ${depositPercent}% due at signing</p>`
    : `<p style="color: #1e293b; font-size: 16px; margin: 0 0 24px;"><strong>Total: $${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p>`;

  try {
    const { error } = await resend.emails.send({
      from: fromHeader,
      replyTo: replyToEmail,
      to,
      ...(cc ? { cc } : {}),
      subject: subject || `Proposal: ${proposalTitle}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #1e293b; font-family: 'Georgia', serif; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: 0.02em;">${esc(orgName)}</h1>
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

// ---- Signed-documents packet ----
// Everything the client may ask to have re-sent after signing: the executed
// agreement (document view) and each invoice tied to the proposal. Built
// entirely from the database — the request only names the proposal.
async function sendSignedDocuments(res: VercelResponse, userId: string, proposalId: string, cc: string) {
  if (!proposalId) return res.status(400).json({ error: "Missing proposalId" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Not configured" });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const callerOrgId = await getUserOrgId(userId);
  if (!callerOrgId) return res.status(403).json({ error: "No organization" });

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, org_id, title, view_token, client_email, client_id, accepted_at, invoice_id, paid_at")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal || proposal.org_id !== callerOrgId) return res.status(404).json({ error: "Proposal not found" });
  if (!proposal.accepted_at) return res.status(400).json({ error: "Proposal has not been signed yet" });

  let toEmail = String(proposal.client_email || "").trim();
  if (!toEmail && proposal.client_id) {
    const { data: client } = await supabase.from("clients").select("email").eq("id", proposal.client_id).maybeSingle();
    toEmail = String(client?.email || "").trim();
  }
  if (!toEmail) return res.status(400).json({ error: "No client email on file" });

  const { data: org } = await supabase
    .from("organizations").select("name, business_info").eq("id", callerOrgId).single();
  const orgName = org?.name || "";
  const bi = (org?.business_info && typeof org.business_info === "object" ? org.business_info : {}) as { email?: string };
  const replyTo = bi.email?.trim() || FROM_EMAIL;

  const appBase = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";
  const links: { label: string; url: string; note?: string }[] = [];
  if (proposal.view_token) {
    links.push({ label: "Signed agreement", url: `${appBase}/proposal/${proposal.view_token}?view=document` });
  }
  if (proposal.invoice_id) {
    const { data: inv } = await supabase
      .from("invoices").select("view_token, invoice_number, total, status").eq("id", proposal.invoice_id).maybeSingle();
    if (inv?.view_token) {
      links.push({
        label: `Invoice ${inv.invoice_number || ""} — $${Number(inv.total || 0).toFixed(2)} (paid)`,
        url: `${appBase}/invoice/${inv.view_token}`,
      });
    }
  }
  const { data: balRows } = await supabase
    .from("invoices").select("view_token, invoice_number, total, status, due_date")
    .eq("org_id", callerOrgId)
    .eq("client_info->>proposalId", proposal.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const balInv = balRows?.[0];
  if (balInv?.view_token) {
    const due = balInv.due_date
      ? new Date(String(balInv.due_date) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";
    links.push({
      label: `Invoice ${balInv.invoice_number || ""} — $${Number(balInv.total || 0).toFixed(2)}${balInv.status === "paid" ? " (paid)" : due ? ` (balance, due ${due})` : " (balance)"}`,
      url: `${appBase}/invoice/${balInv.view_token}`,
      note: balInv.status === "paid" ? undefined : "View & pay online",
    });
  }
  if (links.length === 0) return res.status(400).json({ error: "No documents to send" });
  for (const l of links) {
    if (!isAllowedUrl(l.url)) return res.status(400).json({ error: "Invalid document URL" });
  }

  const buttons = links.map(l => `
    <p style="margin: 10px 0;">
      <a href="${escapeHtml(l.url)}" style="display: inline-block; padding: 12px 24px; background: #0f172a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">${escapeHtml(l.label)}</a>
      ${l.note ? `<span style="color:#64748b;font-size:12px;margin-left:8px;">${escapeHtml(l.note)}</span>` : ""}
    </p>`).join("");

  try {
    const { error } = await resend.emails.send({
      from: orgName ? `${orgName} <${FROM_EMAIL}>` : FROM_EMAIL,
      replyTo,
      to: toEmail,
      ...(cc ? { cc } : {}),
      subject: `Your signed documents — ${proposal.title || "your booking"}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
            <h1 style="color: #1e293b; font-family: 'Georgia', serif; font-size: 22px; font-weight: 600; margin: 0;">${escapeHtml(orgName)}</h1>
          </div>
          <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 4px;">Your documents for ${escapeHtml(proposal.title || "your booking")}</h2>
          <p style="color: #64748b; font-size: 14px; margin: 0 0 20px;">As requested — each link below is yours to open, print, or save as a PDF anytime.</p>
          ${buttons}
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Questions? Reply to this email and we'll get back to you.</p>
          <p style="color: #cbd5e1; font-size: 10px; text-align: center; margin-top: 24px;">Sent via Slate</p>
        </div>`,
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, to: toEmail, documents: links.length });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to send documents") });
  }
}
