// ============================================================
// Owner clicks "Send via Email" on a series review — we ship a
// branded email to the linked client's email address with the
// review link inside. The body is the owner's saved (or edited)
// message template, run through the substitution. Reply-To is the
// org's business email so client replies hit the owner directly.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";
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

  const { seriesId, body, subject, toOverride } = req.body || {};
  if (!seriesId) return res.status(400).json({ error: "Missing seriesId" });
  if (!body || typeof body !== "string") return res.status(400).json({ error: "Missing body" });

  // Verify caller is owner of the org that owns this series
  const callerOrgId = await getUserOrgId(user.userId);
  if (!callerOrgId) return res.status(403).json({ error: "No org" });

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .select("id, name, org_id, client_id, review_token")
    .eq("id", seriesId)
    .single();
  if (seriesErr || !series) return res.status(404).json({ error: "Series not found" });
  if (series.org_id !== callerOrgId) return res.status(403).json({ error: "Wrong org" });
  if (!series.review_token) return res.status(400).json({ error: "Series isn't ready for review yet — generate a review link first" });

  // Resolve recipient — explicit override beats client.email so the
  // owner can re-route a single send (e.g. "send to a different
  // contact this round").
  let toEmail: string;
  let toName = "";
  let clientCompany = "";
  if (toOverride && typeof toOverride === "string" && toOverride.includes("@")) {
    toEmail = toOverride;
  } else {
    const { data: client } = await supabase
      .from("clients")
      .select("email, contact_name, company")
      .eq("id", series.client_id)
      .single();
    toEmail = client?.email || "";
    toName = client?.contact_name || "";
    clientCompany = client?.company || "";
  }
  if (!toEmail) return res.status(400).json({ error: "Client has no email — add one in the Clients page first" });

  // Org branding for the email shell
  const { data: org } = await supabase
    .from("organizations")
    .select("name, business_info")
    .eq("id", series.org_id)
    .single();
  const orgName = org?.name || "Production";
  const orgBusinessInfo = (org?.business_info as { email?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string; website?: string }) || null;
  const replyToEmail = orgBusinessInfo?.email?.trim() || FROM_EMAIL;

  // The owner's body has already been substituted client-side. We
  // wrap it in a branded HTML shell. Plain-text fallback is the
  // raw body. Newlines → <br> so the owner's formatting is preserved.
  const bodyHtml = escapeHtml(body).replace(/\n/g, "<br>");
  const fromHeader = `${orgName} <${FROM_EMAIL}>`;
  const brandedFooter = emailFooter({ orgName, businessInfo: orgBusinessInfo });

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
        <h1 style="color: #1e293b; font-family: 'Georgia', serif; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: 0.02em;">${escapeHtml(orgName)}</h1>
      </div>
      <div style="color: #1e293b; font-size: 15px; line-height: 1.65;">
        ${bodyHtml}
      </div>
      ${brandedFooter}
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromHeader,
      replyTo: replyToEmail,
      to: toEmail,
      subject: subject || `Series for review: ${series.name}`,
      html,
      text: body, // plain-text fallback
    });
    if (error) throw new Error(typeof error === "string" ? error : (error as { message?: string }).message || "Send failed");

    // Stamp sent_for_review_at if not already set (idempotent — series-send-for-review
    // already does this, but covers the edge case where someone hits this directly)
    await supabase
      .from("series")
      .update({ sent_for_review_at: new Date().toISOString() })
      .eq("id", seriesId);

    return res.status(200).json({ ok: true, to: toEmail, toName, clientCompany });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to send email") });
  }
}
