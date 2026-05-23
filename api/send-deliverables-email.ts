// ============================================================
// Owner clicks "Send Client Deliverables" on a project — we ship a
// branded email to the project's client with the project's Google
// Drive link inside (or any deliverable URL stored on the project).
// Reply-To is the org's business email so client replies hit the
// owner directly.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";

// Deliverable URLs are owner-supplied (Google Drive, Dropbox, WeTransfer,
// etc.), so isAllowedUrl's same-domain allowlist is too tight. We only
// need to confirm the value parses as http(s) — anything else is trusted
// because the owner typed it on their own project.
function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
import { emailFooter } from "./_emailBranding.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { projectId, toEmail, subject, message } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "Missing projectId" });
  if (!toEmail || typeof toEmail !== "string" || !toEmail.includes("@")) {
    return res.status(400).json({ error: "Valid recipient email required" });
  }

  const callerOrgId = await getUserOrgId(user.userId);
  if (!callerOrgId) return res.status(403).json({ error: "No org" });

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, org_id, client_id, deliverable_url, project_type_id, date")
    .eq("id", projectId)
    .single();
  if (projErr || !project) return res.status(404).json({ error: "Project not found" });
  if (project.org_id !== callerOrgId) return res.status(403).json({ error: "Wrong org" });
  if (!project.deliverable_url) {
    return res.status(400).json({ error: "No deliverable link on this project — add a Google Drive URL first" });
  }
  if (!isValidHttpUrl(project.deliverable_url)) {
    return res.status(400).json({ error: "Deliverable URL must be a valid http(s) link" });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("contact_name, company")
    .eq("id", project.client_id)
    .single();
  const clientName = client?.contact_name || client?.company || "there";

  const { data: org } = await supabase
    .from("organizations")
    .select("name, business_info")
    .eq("id", project.org_id)
    .single();
  const orgName = org?.name || "Production";
  const orgBusinessInfo = (org?.business_info as { email?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string; website?: string }) || null;
  const replyToEmail = orgBusinessInfo?.email?.trim() || FROM_EMAIL;

  const safeMessage = message && typeof message === "string" && message.trim()
    ? escapeHtml(message).replace(/\n/g, "<br>")
    : `Hi ${escapeHtml(clientName)},<br><br>Your deliverables are ready! Click the link below to view and download your files.`;

  const safeUrl = escapeHtml(project.deliverable_url);
  const fromHeader = `${orgName} <${FROM_EMAIL}>`;
  const brandedFooter = emailFooter({ orgName, businessInfo: orgBusinessInfo });

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
        <h1 style="color: #1e293b; font-family: 'Georgia', serif; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: 0.02em;">${escapeHtml(orgName)}</h1>
      </div>
      <div style="color: #1e293b; font-size: 15px; line-height: 1.65;">
        ${safeMessage}
      </div>
      <div style="margin: 32px 0; text-align: center;">
        <a href="${safeUrl}" style="display: inline-block; background: #0088ff; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">View Your Deliverables</a>
      </div>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #1e293b;">How to download</p>
        <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #475569;">
          Click the button above to open your files. Once the folder loads, you can download a single file by clicking it and selecting Download — or download everything by right-clicking the folder and choosing "Download all."
        </p>
      </div>
      <p style="font-size: 13px; color: #64748b; line-height: 1.6;">
        If the button doesn't work, paste this link into your browser:<br>
        <span style="word-break: break-all; color: #0088ff;">${safeUrl}</span>
      </p>
      ${brandedFooter}
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromHeader,
      replyTo: replyToEmail,
      to: toEmail,
      subject: subject || "Your project deliverables are ready",
      html,
      text: `Your deliverables are ready: ${project.deliverable_url}`,
    });
    if (error) throw new Error(typeof error === "string" ? error : (error as { message?: string }).message || "Send failed");
    return res.status(200).json({ ok: true, to: toEmail });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to send email") });
  }
}
