// ============================================================
// Daily cron — contract reminders
// Emails unsigned signers (primary client + any additional signers
// without signedAt) on contracts where reminders_enabled = true and
// status is "sent" or "client_signed". 3-day cadence enforced via
// contracts.last_reminder_sent_at.
//
// Schedule: registered in vercel.json
// Auth: Bearer CRON_SECRET
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { errorMessage, escapeHtml, isAllowedUrl } from "./_auth.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_BASE = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";
const REMINDER_INTERVAL_DAYS = 3;

interface AdditionalSigner {
  id: string;
  name: string;
  email: string;
  role: string;
  signToken: string;
  signedAt: string | null;
}
interface ContractRow {
  id: string;
  org_id: string;
  title: string;
  client_email: string;
  client_signed_at: string | null;
  sign_token: string;
  status: string;
  additional_signers: AdditionalSigner[] | null;
  last_reminder_sent_at: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cutoff = new Date(Date.now() - REMINDER_INTERVAL_DAYS * 86400_000).toISOString();

  try {
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select("id, org_id, title, client_email, client_signed_at, sign_token, status, additional_signers, last_reminder_sent_at")
      .eq("reminders_enabled", true)
      .in("status", ["sent", "client_signed"])
      .is("deleted_at", null)
      .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${cutoff}`);
    if (error) throw new Error(error.message);

    const remindedContractIds: string[] = [];
    let totalEmails = 0;

    for (const c of (contracts || []) as ContractRow[]) {
      // Pull org name for the email body.
      const { data: org } = await supabase.from("organizations").select("name").eq("id", c.org_id).single();
      const orgName = org?.name || "Your production company";

      // Build recipient list — only signers who haven't signed yet.
      const recipients: { to: string; signToken: string; name?: string }[] = [];
      if (!c.client_signed_at && c.client_email) {
        recipients.push({ to: c.client_email, signToken: c.sign_token });
      }
      for (const s of (c.additional_signers || [])) {
        if (!s.signedAt && s.email) {
          recipients.push({ to: s.email, signToken: s.signToken, name: s.name });
        }
      }

      if (recipients.length === 0) continue;

      let sentAny = false;
      for (const r of recipients) {
        const signUrl = `${APP_BASE}/sign/${r.signToken}`;
        if (!isAllowedUrl(signUrl)) continue;
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: r.to,
            subject: `Reminder: ${c.title}`,
            html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 20px;">
              <h2 style="color:#0088ff;font-size:20px;margin:0 0 8px;">Friendly reminder</h2>
              <p style="color:#1e293b;font-size:14px;margin:0 0 16px;">${escapeHtml(orgName)} is waiting on your signature for <strong>${escapeHtml(c.title)}</strong>.</p>
              <a href="${escapeHtml(signUrl)}" style="display:inline-block;padding:12px 24px;background:#0088ff;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Review &amp; Sign</a>
              <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Sent via Slate by ${escapeHtml(orgName)}.</p>
            </div>`,
          });
          sentAny = true;
          totalEmails++;
        } catch { /* swallow per-recipient — continue with next */ }
      }

      if (sentAny) {
        await supabase
          .from("contracts")
          .update({ last_reminder_sent_at: new Date().toISOString() })
          .eq("id", c.id);
        remindedContractIds.push(c.id);
      }
    }

    return res.status(200).json({
      ok: true,
      contractsChecked: (contracts || []).length,
      contractsReminded: remindedContractIds.length,
      emailsSent: totalEmails,
    });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Reminder cron failed") });
  }
}
