// ============================================================
// Stripe Webhook — Handle subscription + payment events
//
// Subscription lifecycle behavior:
// - active / trialing: keep paid tier, billing_status='ok'
// - past_due / unpaid: keep paid tier + flag banner (Stripe retries ~3 weeks
//   automatically; we don't yank access on the first failure)
// - deleted / incomplete_expired: drop to free, billing_status='cancelled'
//
// Feature sync:
// - On Pro subscription: enable profitLoss, partnerSplits, mileage, budget,
//   clientHealth flags on organizations.features.
// - On Basic or Free: disable those 5 Pro-only flags (keeps feature access
//   aligned with what the user actually paid for).
// - Other features (invoicing, calendar, etc.) are untouched — those are
//   owner-managed in Settings regardless of tier.
//
// Invoice events:
// - invoice.payment_failed: flag billing_status='past_due' (belt+suspenders)
// - invoice.payment_succeeded: clear billing_status to 'ok'
//
// Invoice payment mode (separate — via Stripe Connect):
// - checkout.session.completed with mode=payment updates invoices + projects
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { pingCronitor } from "./_cronitor.js";
import { errorMessage, escapeHtml } from "./_auth.js";
import { sendOpsAlert as sendOpsAlertShared } from "./_opsAlert.js";
import { brandedEmailWrapper } from "./_emailBranding.js";
import { saveSelectionsAndAlert } from "./delivery-public.js";

const CRONITOR_MONITOR = "slate-stripe-webhook";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const OPS_ALERT_TO = process.env.FEEDBACK_TO_EMAIL || "geoff@sdubmedia.com";
const OPS_ALERT_FROM = process.env.RESEND_FROM_EMAIL || "noreply@sdubmedia.com";

// Fire-and-forget ops alert to the admin. Errors logged but not thrown so
// the webhook still returns 200 to Stripe even if email is down.
async function sendOpsAlert(subject: string, body: string) {
  try {
    if (!process.env.RESEND_API_KEY) return; // email disabled
    await resend.emails.send({
      from: `Slate Ops <${OPS_ALERT_FROM}>`,
      to: OPS_ALERT_TO,
      subject: `[Slate] ${subject}`,
      text: body,
    });
  } catch (err) {
    console.error(`[stripe-webhook] ops alert failed: ${errorMessage(err)}`);
  }
}

async function orgNameFor(orgId: string): Promise<string> {
  const { data } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
  return data?.name || orgId;
}

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Pro-tier features unlocked/locked by subscription plan.
const PRO_FEATURE_KEYS = ["profitLoss", "partnerSplits", "mileage", "budget", "clientHealth"] as const;

function featureOverridesForPlan(plan: string): Record<string, boolean> | null {
  const p = (plan || "").toLowerCase();
  if (p === "pro") return Object.fromEntries(PRO_FEATURE_KEYS.map(k => [k, true]));
  // Basic + free: lock the Pro-only features.
  return Object.fromEntries(PRO_FEATURE_KEYS.map(k => [k, false]));
}

async function applyPlan(orgId: string, plan: "pro" | "basic" | "free", billingStatus: "ok" | "past_due" | "cancelled", subscriptionId?: string | null) {
  const paid = plan !== "free";
  // Merge Pro-feature flags into existing features (preserve other fields).
  const { data: org } = await supabase.from("organizations").select("features").eq("id", orgId).maybeSingle();
  const existingFeatures = (org?.features as Record<string, unknown>) || {};
  const newFeatures = { ...existingFeatures, ...featureOverridesForPlan(plan) };

  const update: Record<string, unknown> = {
    plan,
    project_limit: paid ? -1 : 10,
    billing_status: billingStatus,
    features: newFeatures,
  };
  if (subscriptionId !== undefined) {
    update.stripe_subscription_id = subscriptionId || "";
  }
  await supabase.from("organizations").update(update).eq("id", orgId);
}

async function setBillingStatusByCustomer(customerId: string, billingStatus: "ok" | "past_due") {
  await supabase.from("organizations").update({ billing_status: billingStatus }).eq("stripe_customer_id", customerId);
}

async function handleDeliveryExtrasPaid(session: Stripe.Checkout.Session) {
  const md = session.metadata || {};
  const deliveryId = md.deliveryId;
  const clientName = md.clientName;
  const clientEmail = md.clientEmail;
  const fileIdsRaw = md.fileIds;
  if (!deliveryId || !clientName || !clientEmail || !fileIdsRaw) return;

  let fileIds: string[];
  try { fileIds = JSON.parse(fileIdsRaw); } catch { return; }
  if (!Array.isArray(fileIds) || fileIds.length === 0) return;

  // Reload the full delivery row — saveSelectionsAndAlert needs the org_id etc.
  const { data: delivery } = await supabase.from("deliveries").select("*").eq("id", deliveryId).single();
  if (!delivery) return;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;

  await saveSelectionsAndAlert(delivery, fileIds, clientName, clientEmail, true, paymentIntentId);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    await pingCronitor(CRONITOR_MONITOR, "fail", { message: "STRIPE_WEBHOOK_SECRET not configured" });
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not configured — refusing to process unverified webhooks" });
  }
  if (!sig) {
    await pingCronitor(CRONITOR_MONITOR, "fail", { message: "missing stripe-signature header" });
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    const body = await getRawBody(req);
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error(`[stripe-webhook] signature verification failed: ${errorMessage(err)}`);
    await pingCronitor(CRONITOR_MONITOR, "fail", { message: `sig verify failed: ${errorMessage(err)}` });
    return res.status(400).json({ error: `Webhook signature verification failed: ${errorMessage(err)}` });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        const plan = (sub.metadata?.plan || "basic").toLowerCase() as "pro" | "basic";
        if (!orgId) break;

        const status = sub.status;
        const previousStatus = (event.data.previous_attributes as { status?: string } | undefined)?.status;

        // past_due/unpaid: keep paid tier, flag banner. Stripe retries ~3 weeks.
        if (status === "active" || status === "trialing") {
          await applyPlan(orgId, plan, "ok", sub.id);
          // Ops alert on NEW subscription (created) or resume from past_due
          if (event.type === "customer.subscription.created") {
            const name = await orgNameFor(orgId);
            const interval = sub.metadata?.interval === "annual" ? "annual" : "monthly";
            await sendOpsAlert(
              `🎉 New subscriber: ${name}`,
              `${name} just subscribed to ${plan.toUpperCase()} (${interval}).\nStatus: ${status}\nSubscription: ${sub.id}`
            );
          } else if (previousStatus === "past_due" || previousStatus === "unpaid") {
            const name = await orgNameFor(orgId);
            await sendOpsAlert(
              `Recovered: ${name}`,
              `${name} is back to active (was past_due). Nothing to do.`
            );
          }
        } else if (status === "past_due" || status === "unpaid") {
          await applyPlan(orgId, plan, "past_due", sub.id);
          const name = await orgNameFor(orgId);
          await sendOpsAlert(
            `⚠️ Past-due: ${name}`,
            `${name}'s renewal payment failed on ${plan.toUpperCase()}.\nStripe will retry automatically for ~3 weeks. Customer sees a "Update card" banner in the app. No immediate action needed unless they reach out.`
          );
        } else {
          // incomplete_expired, canceled — drop to free
          await applyPlan(orgId, "free", "cancelled", null);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (orgId) {
          await applyPlan(orgId, "free", "cancelled", null);
          const name = await orgNameFor(orgId);
          const prevPlan = (sub.metadata?.plan || "basic").toUpperCase();
          await sendOpsAlert(
            `Cancelled: ${name}`,
            `${name} cancelled their ${prevPlan} subscription. Downgraded to free tier.\nSubscription: ${sub.id}`
          );
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) await setBillingStatusByCustomer(customerId, "past_due");
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) await setBillingStatusByCustomer(customerId, "ok");
        break;
      }

      case "checkout.session.completed": {
        // Two checkout flavors via Stripe Connect:
        //   - invoiceId metadata → invoice payment (existing flow)
        //   - kind=delivery_extras metadata → delivery proofing extras (new flow)
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.metadata?.invoiceId) {
          const today = new Date().toISOString().slice(0, 10);
          await supabase.from("invoices").update({
            status: "paid",
            paid_date: today,
          }).eq("id", session.metadata.invoiceId);

          const { data: invoice } = await supabase.from("invoices").select("line_items").eq("id", session.metadata.invoiceId).maybeSingle();
          if (invoice?.line_items) {
            const projectIds = (invoice.line_items as { projectId?: string }[]).map(li => li.projectId).filter(Boolean);
            for (const pid of projectIds) {
              await supabase.from("projects").update({ paid_date: today }).eq("id", pid);
            }
          }
        } else if (session.mode === "payment" && session.metadata?.kind === "delivery_extras") {
          await handleDeliveryExtrasPaid(session);
        } else if (session.mode === "payment" && session.metadata?.kind === "milestone_payment") {
          // Cron-emailed payment link → stamp `paidAt` on the matching
          // milestone so the payment-reminders cron skips it on subsequent
          // runs. The milestone is identified by the `milestoneId` we set
          // when creating the Checkout session.
          const contractId = session.metadata.contractId;
          const milestoneId = session.metadata.milestoneId;
          if (contractId && milestoneId) {
            const { data: contract } = await supabase
              .from("contracts")
              .select("payment_milestones, title, client_email, org_id, sign_token")
              .eq("id", contractId)
              .maybeSingle();
            const ms = (contract?.payment_milestones as Array<Record<string, unknown>> | null) || null;
            if (Array.isArray(ms)) {
              const nowIso = new Date().toISOString();
              const next = ms.map((m, i) => {
                const idMatch = m.id ? m.id === milestoneId : `ms_${i}` === milestoneId;
                return idMatch ? { ...m, paidAt: nowIso } : m;
              });
              await supabase.from("contracts").update({
                payment_milestones: next,
                updated_at: nowIso,
              }).eq("id", contractId);

              // Send a branded "thanks for paying" receipt to the client
              // (Stripe also sends its own receipt; this one ties the
              // payment to the contract + portal link). Best-effort —
              // don't block the webhook on email send failure.
              if (contract?.client_email && contract?.org_id) {
                sendMilestoneReceiptEmail({
                  contractId: contract.id as string,
                  contractTitle: contract.title as string,
                  clientEmail: contract.client_email as string,
                  signToken: contract.sign_token as string,
                  orgId: contract.org_id as string,
                  milestones: next,
                  paidMilestoneId: milestoneId,
                  amountCents: session.amount_total ?? 0,
                }).catch(err => {
                  console.error(`[stripe-webhook] receipt email failed: ${errorMessage(err)}`);
                  sendOpsAlertShared(
                    "Milestone receipt email failed",
                    `Contract: ${contract.id}\nClient: ${contract.client_email}\nError: ${errorMessage(err)}\n\nThe paidAt was stamped successfully; only the customer's branded receipt failed to send. Stripe's auto-receipt still went out.`,
                  ).catch(() => {});
                });
              }
            }
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler failed: event=${event.type} msg=${errorMessage(err)} raw=${err?.raw?.message}`);
    await pingCronitor(CRONITOR_MONITOR, "fail", { message: `handler failed on ${event.type}: ${errorMessage(err)}` });
    // Return 200 anyway so Stripe doesn't retry on our internal errors.
    // Webhook replay from dashboard is still possible if needed.
    return res.status(200).json({ received: true, error: errorMessage(err) });
  }

  await pingCronitor(CRONITOR_MONITOR, "complete", { message: event.type });
  return res.status(200).json({ received: true });
}

/**
 * Send a branded receipt to the client when a milestone payment completes.
 * Stripe also sends its own receipt; this one ties the payment to the
 * specific contract + remaining balance + portal link, so the client can
 * see what they paid for and what's still due. Sender uses the org's
 * configured business email.
 */
async function sendMilestoneReceiptEmail(input: {
  contractId: string;
  contractTitle: string;
  clientEmail: string;
  signToken: string;
  orgId: string;
  milestones: Array<Record<string, unknown>>;
  paidMilestoneId: string;
  amountCents: number;
}): Promise<void> {
  // Lookup org branding for from-line + reply-to.
  const { data: org } = await supabase
    .from("organizations")
    .select("name, business_info")
    .eq("id", input.orgId)
    .single();
  const orgName = org?.name || "Your contractor";
  const businessInfo = (org?.business_info as { email?: string } | null) || {};
  const orgEmail = businessInfo.email?.trim() || process.env.RESEND_FROM_EMAIL || "Geoff@SdubMedia.com";

  const paidAmount = input.amountCents / 100;
  // Compute remaining balance from milestones (sum of unpaid amounts).
  let total = 0;
  let unpaidTotal = 0;
  for (const m of input.milestones) {
    const amount = m.type === "fixed"
      ? Number(m.fixedAmount ?? m.amount ?? 0)
      : 0; // percent milestones contribute to total via fixed siblings
    total += amount;
    if (!m.paidAt) unpaidTotal += amount;
  }
  // For percent-only schedules, fall back to a simple paid-vs-rest narrative.
  const stillOwedLine = total > 0 && unpaidTotal > 0
    ? `Remaining balance: <strong>$${unpaidTotal.toFixed(2)}</strong>`
    : "All payments are now complete. Thank you!";

  const portalUrl = `${process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com"}/sign/${input.signToken}`;

  const body = `
    <h2 style="margin:0 0 4px;font-size:18px;color:#059669;">Payment received ✓</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">${escapeHtml(input.contractTitle)}</p>
    <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Amount paid</td><td style="padding:4px 0;font-weight:600;">$${paidAmount.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Date</td><td style="padding:4px 0;">${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</td></tr>
    </table>
    <p style="margin:16px 0;font-size:14px;">${stillOwedLine}</p>
    <p style="margin:24px 0;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View your contract + payment status</a></p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">Stripe also sent you a separate receipt for tax / accounting purposes. Reply to this email if you have any questions.</p>`;
  const html = brandedEmailWrapper({ orgName, businessInfo: businessInfo as { email?: string; phone?: string } }, body);

  await resend.emails.send({
    from: `${orgName} <${orgEmail}>`,
    to: input.clientEmail,
    subject: `Payment received: $${paidAmount.toFixed(2)} for ${input.contractTitle}`,
    html,
    replyTo: orgEmail,
  });
}

