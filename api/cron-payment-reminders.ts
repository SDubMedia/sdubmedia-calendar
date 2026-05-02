// ============================================================
// Daily cron — payment milestone reminders
//
// Scans all contracts with payment_milestones, computes "days until due"
// per unpaid milestone, and emails the client when the milestone is in
// one of the reminder windows: -7, 0, +1, +30 days from due date.
//
// Each milestone tracks `lastReminderSentAt` so reruns within the same
// day don't double-send. A milestone with `paidAt` set is skipped (the
// stripe-webhook stamps paidAt when the corresponding Checkout session
// completes).
//
// Schedule: registered in vercel.json (14:00 UTC / 9 am ET).
// Auth: Bearer CRON_SECRET.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import Stripe from "stripe";
import { errorMessage, escapeHtml, isAllowedUrl } from "./_auth.js";
import { sendOpsAlert } from "./_opsAlert.js";
import { brandedEmailWrapper } from "./_emailBranding.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-11-20.acacia" });

// Sender — defaults to the org's business email from Settings, so each
// SaaS customer's reminders look like they come from their own address
// (requires their domain to be verified in Resend). Falls back to the
// platform default if the org hasn't configured an email yet.
const FALLBACK_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Geoff@SdubMedia.com";
const APP_BASE = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";
const CRONITOR_TELEMETRY_KEY = process.env.CRONITOR_TELEMETRY_KEY || "";
const CRONITOR_MONITOR = "slate-payment-reminders";

// Reminder windows in days-until-due. Negative = days late. The cron fires
// once per day, so each window represents a single day of nagging — no
// continuous reminders, no spam if client is 5 days late they hear from
// us on day 1 and day 30, that's it.
const REMINDER_OFFSETS = [-7, 0, 1, 30] as const;

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

interface ContractRow {
  id: string;
  org_id: string;
  title: string;
  client_email: string;
  client_signed_at: string | null;
  status: string;
  payment_milestones: Milestone[] | null;
  proposal_id: string | null;
}

interface OrgRow {
  id: string;
  name: string;
  stripe_account_id: string | null;
  business_info: { email?: string; phone?: string } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  // Cronitor: tick-on-start so a hung run shows as overdue.
  if (CRONITOR_TELEMETRY_KEY) {
    try { await fetch(`https://cronitor.link/p/${CRONITOR_TELEMETRY_KEY}/${CRONITOR_MONITOR}?state=run`); }
    catch { /* best-effort */ }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Pull contracts that could have due milestones. Status = "client_signed"
  // (client signed but vendor hasn't yet) or "completed" (both signed).
  // Drafts and voided contracts have no enforceable schedule.
  const { data: contracts, error } = await supabase
    .from("contracts")
    .select("id, org_id, title, client_email, client_signed_at, status, payment_milestones, proposal_id")
    .in("status", ["client_signed", "completed"])
    .is("deleted_at", null);
  if (error) {
    console.error(`[payment-reminders] supabase: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of (contracts as ContractRow[] | null) ?? []) {
    if (!Array.isArray(c.payment_milestones) || c.payment_milestones.length === 0) {
      skipped++;
      continue;
    }
    if (!c.client_email) { skipped++; continue; }

    // Compute the contract total from milestones (or just sum the resolved
    // amounts when the row was generated).
    const total = computeContractTotal(c.payment_milestones);

    // Load the org once per contract (fields used in email + Stripe Connect).
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, stripe_account_id, business_info")
      .eq("id", c.org_id)
      .single<OrgRow>();
    if (!org) { skipped++; continue; }

    let updatedMilestones = false;
    const nextMilestones = [...c.payment_milestones];

    for (let i = 0; i < nextMilestones.length; i++) {
      const ms = nextMilestones[i];
      if (ms.paidAt) continue;
      // at_signing milestones are collected at signing, not via this cron.
      if (ms.dueType === "at_signing") continue;
      const dueIso = resolveDueDate(ms, c.client_signed_at);
      if (!dueIso) continue;
      const daysUntilDue = daysBetween(todayIso, dueIso);

      if (!REMINDER_OFFSETS.includes(daysUntilDue as typeof REMINDER_OFFSETS[number])) continue;

      // Idempotency: if we already sent a reminder TODAY for this milestone,
      // skip (a single cron run could otherwise double-fire on retry).
      if (ms.lastReminderSentAt && ms.lastReminderSentAt.slice(0, 10) === todayIso) continue;

      const amount = computeAmount(ms, total);
      if (amount <= 0) continue;

      try {
        const milestoneId = ms.id || `ms_${i}`;
        const payUrl = await createPaymentLink(c.id, milestoneId, amount, ms.label || "Payment", org, c.title);
        const subject = formatSubject(amount, dueIso, daysUntilDue);
        const html = renderEmail({
          contractTitle: c.title,
          orgName: org.name,
          businessInfo: org.business_info,
          label: ms.label || "Payment",
          amount,
          dueIso,
          daysUntilDue,
          payUrl,
        });
        // Prefer the org's configured business email so each customer's
        // reminders come from their own address, not a platform default.
        // Display name = org name so the client sees "S-Dub Media" not
        // a raw email handle in their inbox.
        const orgEmail = org.business_info?.email?.trim() || FALLBACK_FROM_EMAIL;
        const fromHeader = `${org.name || "Your contractor"} <${orgEmail}>`;
        await resend.emails.send({
          from: fromHeader,
          to: c.client_email,
          subject,
          html,
          replyTo: orgEmail,
        });
        nextMilestones[i] = { ...ms, lastReminderSentAt: new Date().toISOString() };
        updatedMilestones = true;
        sent++;
      } catch (err) {
        errors.push(`contract=${c.id} milestone=${i} err=${errorMessage(err)}`);
      }
    }

    if (updatedMilestones) {
      const { error: updErr } = await supabase
        .from("contracts")
        .update({ payment_milestones: nextMilestones, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      if (updErr) errors.push(`contract=${c.id} update=${updErr.message}`);
    }
  }

  if (CRONITOR_TELEMETRY_KEY) {
    const state = errors.length === 0 ? "complete" : "fail";
    try { await fetch(`https://cronitor.link/p/${CRONITOR_TELEMETRY_KEY}/${CRONITOR_MONITOR}?state=${state}&metric=count:${sent}`); }
    catch { /* best-effort */ }
  }

  // Surface batch-level errors as an ops alert so a partial cron failure
  // doesn't go unnoticed. Threshold: any error in the run.
  if (errors.length > 0) {
    sendOpsAlert(
      `Payment reminders cron had ${errors.length} error${errors.length === 1 ? "" : "s"}`,
      `Sent: ${sent}\nSkipped: ${skipped}\nErrors:\n${errors.join("\n")}`,
    ).catch(() => {});
  }

  return res.status(200).json({ ok: true, sent, skipped, errors });
}

// ---- helpers ----

function resolveDueDate(ms: Milestone, signedAtIso: string | null): string | null {
  if (ms.dueType === "absolute_date") return ms.dueDate || null;
  if (ms.dueType === "relative_days" && signedAtIso) {
    const d = new Date(signedAtIso);
    d.setDate(d.getDate() + (ms.dueDays ?? 0));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T00:00:00Z");
  const b = new Date(bIso + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function computeContractTotal(milestones: Milestone[]): number {
  // If any milestone is "fixed", the total is the sum of fixed amounts plus
  // the percent slices applied to that sum (legacy behavior). Cleanest path
  // is to just sum amount/fixedAmount when present and ignore percents.
  let sum = 0;
  for (const m of milestones) {
    if (m.type === "fixed") sum += Number(m.fixedAmount ?? m.amount ?? 0);
  }
  // If everything is percent-based, fall back to amount * 100/percent reverse
  // calc using the first percent milestone — but the cleaner shape is for the
  // contract generator to also stash the resolved `amount` per milestone.
  // For now this returns 0 for percent-only schedules; computeAmount() then
  // returns 0 too and the milestone is skipped.
  return sum;
}

function computeAmount(ms: Milestone, total: number): number {
  if (ms.type === "percent") return Math.round(total * (ms.percent || 0) / 100 * 100) / 100;
  return Number(ms.fixedAmount ?? ms.amount ?? 0);
}

function formatSubject(amount: number, dueIso: string, daysUntilDue: number): string {
  const dueLabel = formatHumanDate(dueIso);
  if (daysUntilDue > 0) return `Payment reminder: $${amount.toFixed(2)} due ${dueLabel}`;
  if (daysUntilDue === 0) return `Payment due today: $${amount.toFixed(2)}`;
  if (daysUntilDue === -1) return `Payment is 1 day past due: $${amount.toFixed(2)}`;
  return `Payment is ${Math.abs(daysUntilDue)} days past due: $${amount.toFixed(2)}`;
}

function formatHumanDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function renderEmail({
  contractTitle, orgName, businessInfo, label, amount, dueIso, daysUntilDue, payUrl,
}: {
  contractTitle: string;
  orgName: string;
  businessInfo: { email?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string; website?: string } | null;
  label: string;
  amount: number;
  dueIso: string;
  daysUntilDue: number;
  payUrl: string | null;
}): string {
  const dueLabel = formatHumanDate(dueIso);
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
    <p style="margin: 0 0 16px; color: #64748b; font-size: 14px;">${escapeHtml(contractTitle)}</p>
    <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
      <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">Milestone</td><td style="padding: 4px 0;">${escapeHtml(label)}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">Amount</td><td style="padding: 4px 0; font-weight: 600;">$${amount.toFixed(2)}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #64748b;">Due</td><td style="padding: 4px 0;">${escapeHtml(dueLabel)}</td></tr>
    </table>
    ${cta}
    <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px;">Questions? Reply to this email and we'll get back to you.</p>`;
  return brandedEmailWrapper({ orgName, businessInfo }, body);
}

async function createPaymentLink(
  contractId: string,
  milestoneId: string,
  amount: number,
  label: string,
  org: OrgRow,
  contractTitle: string,
): Promise<string | null> {
  if (!org.stripe_account_id) return null;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const successUrl = `${APP_BASE}/sign/${contractId}?paid=true&milestone=${encodeURIComponent(milestoneId)}`;
    const cancelUrl = `${APP_BASE}/sign/${contractId}?paid=false`;
    if (!isAllowedUrl(successUrl) || !isAllowedUrl(cancelUrl)) return null;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: contractTitle || "Payment",
            description: `${label} — ${org.name || ""}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        contractId,
        milestoneId,
        orgId: org.id,
        kind: "milestone_payment",
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    }, { stripeAccount: org.stripe_account_id });
    return session.url ?? null;
  } catch (err) {
    console.error(`[payment-reminders] stripe checkout failed: ${errorMessage(err)}`);
    return null;
  }
}
