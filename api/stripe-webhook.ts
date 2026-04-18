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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not configured — refusing to process unverified webhooks" });
  }
  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    const body = await getRawBody(req);
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`[stripe-webhook] signature verification failed: ${err?.message}`);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
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
        // past_due/unpaid: keep paid tier, flag banner. Stripe retries ~3 weeks.
        if (status === "active" || status === "trialing") {
          await applyPlan(orgId, plan, "ok", sub.id);
        } else if (status === "past_due" || status === "unpaid") {
          await applyPlan(orgId, plan, "past_due", sub.id);
        } else {
          // incomplete_expired, canceled — drop to free
          await applyPlan(orgId, "free", "cancelled", null);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (orgId) await applyPlan(orgId, "free", "cancelled", null);
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
        // Invoice-payment mode (via Stripe Connect) — unrelated to SaaS subscription.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.metadata?.invoiceId) {
          const today = new Date().toISOString().slice(0, 10);
          await supabase.from("invoices").update({
            status: "paid",
            paid_date: today,
          }).eq("id", session.metadata.invoiceId);

          const { data: invoice } = await supabase.from("invoices").select("line_items").eq("id", session.metadata.invoiceId).maybeSingle();
          if (invoice?.line_items) {
            const projectIds = (invoice.line_items as any[]).map((li: any) => li.projectId).filter(Boolean);
            for (const pid of projectIds) {
              await supabase.from("projects").update({ paid_date: today }).eq("id", pid);
            }
          }
        }
        break;
      }
    }
  } catch (err: any) {
    console.error(`[stripe-webhook] handler failed: event=${event.type} msg=${err?.message} raw=${err?.raw?.message}`);
    // Return 200 anyway so Stripe doesn't retry on our internal errors.
    // Webhook replay from dashboard is still possible if needed.
    return res.status(200).json({ received: true, error: err.message });
  }

  return res.status(200).json({ received: true });
}
