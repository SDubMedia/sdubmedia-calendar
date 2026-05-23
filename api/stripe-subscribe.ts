// ============================================================
// Stripe Subscribe — SaaS subscription management
// Payments go to YOUR Stripe account (platform)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, isAllowedUrl, errorMessage } from "./_auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

// Price IDs — monthly + annual per plan.
// Env vars must not have trailing newlines (use printf, not echo, when adding).
const PRICE_IDS: Record<string, { monthly: string; annual: string }> = {
  basic: {
    monthly: process.env.STRIPE_BASIC_PRICE_ID || "",
    annual: process.env.STRIPE_BASIC_ANNUAL_PRICE_ID || "",
  },
  pro: {
    monthly: process.env.STRIPE_PRO_PRICE_ID || "",
    annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || "",
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const callerOrgId = await getUserOrgId(user.userId);

  // Verify org ownership
  const requestOrgId = (req.body?.orgId || req.query.orgId) as string;
  if (requestOrgId && callerOrgId !== requestOrgId) {
    return res.status(403).json({ error: "Access denied — org mismatch" });
  }

  const { action } = req.query;

  try {
    switch (action) {
      case "create-checkout": return await createCheckout(req, res);
      case "portal": return await createPortal(req, res);
      case "status": return await getStatus(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    const detail = `type=${err?.type} code=${err?.code} status=${err?.statusCode} msg=${errorMessage(err)} raw=${err?.raw?.message}`;
    console.error(`[stripe-subscribe] ${detail}`);
    return res.status(500).json({ error: errorMessage(err), detail });
  }
}

// Create subscription checkout session
async function createCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { plan, orgId, email, successUrl, cancelUrl, interval } = req.body as {
    plan?: string; orgId?: string; email?: string; successUrl?: string; cancelUrl?: string; interval?: string;
  };
  if (!plan || !orgId) return res.status(400).json({ error: "Missing plan or orgId" });

  const prices = PRICE_IDS[plan];
  if (!prices) return res.status(400).json({ error: `Unknown plan: ${plan}` });

  const billingInterval = interval === "annual" ? "annual" : "monthly";
  const priceId = billingInterval === "annual" ? prices.annual : prices.monthly;
  if (!priceId) return res.status(400).json({ error: `No ${billingInterval} price configured for ${plan}. Set STRIPE_${plan.toUpperCase()}${billingInterval === "annual" ? "_ANNUAL" : ""}_PRICE_ID env var.` });

  // Get or create Stripe customer
  const { data: org } = await supabase.from("organizations").select("stripe_customer_id").eq("id", orgId).single();

  let customerId = org?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email, metadata: { orgId } });
    customerId = customer.id;
    await supabase.from("organizations").update({ stripe_customer_id: customerId }).eq("id", orgId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: 14,
      metadata: { orgId, plan, interval: billingInterval },
    },
    success_url: (successUrl && isAllowedUrl(successUrl)) ? successUrl : `${req.headers.origin}/?upgraded=${plan}`,
    cancel_url: (cancelUrl && isAllowedUrl(cancelUrl)) ? cancelUrl : `${req.headers.origin}/`,
  });

  return res.status(200).json({ url: session.url });
}

// Create billing portal for managing subscription
async function createPortal(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { orgId, returnUrl } = req.body;
  if (!orgId) return res.status(400).json({ error: "Missing orgId" });

  const { data: org } = await supabase.from("organizations").select("stripe_customer_id").eq("id", orgId).single();
  if (!org?.stripe_customer_id) return res.status(400).json({ error: "No subscription found" });

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: (returnUrl && isAllowedUrl(returnUrl)) ? returnUrl : `${req.headers.origin}/settings`,
  });

  return res.status(200).json({ url: session.url });
}

// Get subscription status
async function getStatus(req: VercelRequest, res: VercelResponse) {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: "Missing orgId" });

  const { data: org } = await supabase.from("organizations").select("stripe_customer_id, plan").eq("id", orgId).single();
  if (!org?.stripe_customer_id) {
    return res.status(200).json({ plan: org?.plan || "free", status: "none" });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: org.stripe_customer_id,
    status: "all",
    limit: 1,
  });

  const sub = subscriptions.data[0];
  if (!sub) return res.status(200).json({ plan: org?.plan || "free", status: "none" });

  return res.status(200).json({
    plan: sub.metadata?.plan || org?.plan || "free",
    status: sub.status, // active, trialing, past_due, canceled
    currentPeriodEnd: sub.current_period_end,
    trialEnd: sub.trial_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
}
