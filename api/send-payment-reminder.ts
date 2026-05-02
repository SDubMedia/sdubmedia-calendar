// ============================================================
// Manual payment-reminder trigger — fires the same email + Stripe link
// the daily cron sends, but on demand from the Outstanding Payments page.
// Owner / partner only, scoped to the caller's org.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import Stripe from "stripe";
import { verifyAuth, getUserOrgId, errorMessage, escapeHtml, isAllowedUrl } from "./_auth.js";
import { brandedEmailWrapper } from "./_emailBranding.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-11-20.acacia" });

// Always send through the verified Slate domain — display name + Reply-To
// carry the contractor's brand. See cron-payment-reminders for context.
const VERIFIED_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@slate.sdubmedia.com";
const APP_BASE = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";

interface Milestone {
  id?: string;
  label?: string;
  type: "percent" | "fixed";
  percent?: number;
  fixedAmount?: number;
  amount?: number;
  dueType: "at_signing" | "absolute_date" | "relative_days";
  dueDays?: number;
  dueDate?: string;
  lastReminderSentAt?: string;
  paidAt?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { contractId, milestoneId } = req.body as { contractId?: string; milestoneId?: string };
  if (!contractId || !milestoneId) return res.status(400).json({ error: "Missing contractId or milestoneId" });

  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Org-scoping (IDOR prevention) — caller must own the contract.
  const callerOrgId = await getUserOrgId(user.userId);
  if (!callerOrgId) return res.status(403).json({ error: "No org" });

  const { data: contract, error: contractErr } = await supabase
    .from("contracts")
    .select("id, org_id, title, client_email, client_signed_at, status, payment_milestones, deleted_at")
    .eq("id", contractId)
    .maybeSingle();
  if (contractErr || !contract) return res.status(404).json({ error: "Contract not found" });
  if (contract.org_id !== callerOrgId) return res.status(403).json({ error: "Forbidden" });
  if (contract.deleted_at) return res.status(400).json({ error: "Contract is archived" });
  if (!contract.client_email) return res.status(400).json({ error: "No client email on contract" });

  const milestones = (contract.payment_milestones as Milestone[] | null) || [];
  const idx = milestones.findIndex((m, i) => (m.id || `ms_${i}`) === milestoneId);
  if (idx < 0) return res.status(404).json({ error: "Milestone not found" });
  const ms = milestones[idx];
  if (ms.paidAt) return res.status(400).json({ error: "Milestone already paid" });

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, stripe_account_id, business_info")
    .eq("id", contract.org_id)
    .single();
  if (!org) return res.status(404).json({ error: "Org not found" });

  // Compute amount + due date the same way the cron does.
  let total = 0;
  for (const m of milestones) {
    if (m.type === "fixed") total += Number(m.fixedAmount ?? m.amount ?? 0);
  }
  const amount = ms.type === "percent"
    ? Math.round(total * (ms.percent || 0) / 100 * 100) / 100
    : Number(ms.fixedAmount ?? ms.amount ?? 0);
  if (amount <= 0) return res.status(400).json({ error: "Cannot compute milestone amount" });

  let dueIso: string | null = null;
  if (ms.dueType === "absolute_date") dueIso = ms.dueDate || null;
  else if (ms.dueType === "relative_days" && contract.client_signed_at) {
    const d = new Date(contract.client_signed_at);
    d.setDate(d.getDate() + (ms.dueDays ?? 0));
    dueIso = d.toISOString().slice(0, 10);
  }
  if (!dueIso) return res.status(400).json({ error: "Milestone has no due date" });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const daysUntilDue = Math.round(
    (new Date(dueIso + "T00:00:00Z").getTime() - new Date(todayIso + "T00:00:00Z").getTime()) / 86_400_000,
  );

  try {
    const businessInfo = (org.business_info as { email?: string } | null) || {};
    const orgEmail = businessInfo.email?.trim() || VERIFIED_FROM_EMAIL;
    const fromHeader = `${org.name || "Your contractor"} <${VERIFIED_FROM_EMAIL}>`;

    let payUrl: string | null = null;
    if (org.stripe_account_id && process.env.STRIPE_SECRET_KEY) {
      const successUrl = `${APP_BASE}/sign/${contract.id}?paid=true&milestone=${encodeURIComponent(milestoneId)}`;
      const cancelUrl = `${APP_BASE}/sign/${contract.id}?paid=false`;
      if (isAllowedUrl(successUrl) && isAllowedUrl(cancelUrl)) {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: {
                name: contract.title || "Payment",
                description: `${ms.label || "Payment"} — ${org.name || ""}`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          }],
          metadata: {
            contractId: contract.id,
            milestoneId,
            orgId: org.id,
            kind: "milestone_payment",
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
        }, { stripeAccount: org.stripe_account_id });
        payUrl = session.url ?? null;
      }
    }

    const subject = daysUntilDue > 0
      ? `Payment reminder: $${amount.toFixed(2)} due ${formatHumanDate(dueIso)}`
      : daysUntilDue === 0
        ? `Payment due today: $${amount.toFixed(2)}`
        : `Payment is ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} past due: $${amount.toFixed(2)}`;
    const headline = daysUntilDue > 0
      ? `Payment due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`
      : daysUntilDue === 0
        ? "Payment due today"
        : `Payment is ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} past due`;
    const cta = payUrl
      ? `<p style="margin: 24px 0;"><a href="${escapeHtml(payUrl)}" style="display: inline-block; background: #059669; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Pay $${amount.toFixed(2)} now</a></p>`
      : `<p style="margin: 16px 0; color: #475569;">Reply to this email and we'll send you a payment link.</p>`;

    const body = `
      <h2 style="margin: 0 0 4px; font-size: 18px;">${escapeHtml(headline)}</h2>
      <p style="margin: 0 0 16px; color: #64748b; font-size: 14px;">${escapeHtml(contract.title || "")}</p>
      <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">Milestone</td><td style="padding: 4px 0;">${escapeHtml(ms.label || "Payment")}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">Amount</td><td style="padding: 4px 0; font-weight: 600;">$${amount.toFixed(2)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">Due</td><td style="padding: 4px 0;">${escapeHtml(formatHumanDate(dueIso))}</td></tr>
      </table>
      ${cta}
      <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px;">Questions? Reply to this email and we'll get back to you.</p>`;
    const html = brandedEmailWrapper({ orgName: org.name, businessInfo: businessInfo as { email?: string; phone?: string } }, body);

    await resend.emails.send({
      from: fromHeader,
      to: contract.client_email,
      subject,
      html,
      replyTo: orgEmail,
    });

    // Stamp lastReminderSentAt so the cron skips the same milestone today.
    const next = milestones.map((m, i) => i === idx ? { ...m, lastReminderSentAt: new Date().toISOString() } : m);
    await supabase
      .from("contracts")
      .update({ payment_milestones: next, updated_at: new Date().toISOString() })
      .eq("id", contract.id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to send reminder") });
  }
}

function formatHumanDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
