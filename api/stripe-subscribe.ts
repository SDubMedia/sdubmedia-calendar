// ============================================================
// Stripe Subscribe — SaaS subscription management
// Payments go to YOUR Stripe account (platform)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

// Price IDs — set these in Stripe Dashboard → Products
// Create two products: "Slate Basic" and "Slate Pro" with monthly prices
const PRICE_IDS: Record<string, string> = {
  basic: process.env.STRIPE_BASIC_PRICE_ID || "",
  pro: process.env.STRIPE_PRO_PRICE_ID || "",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action } = req.query;

  try {
    switch (action) {
      case "create-checkout": return await createCheckout(req, res);
      case "portal": return await createPortal(req, res);
      case "status": return await getStatus(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Create subscription checkout session
async function createCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { plan, orgId, email, successUrl, cancelUrl } = req.body;
  if (!plan || !orgId) return res.status(400).json({ error: "Missing plan or orgId" });

  const priceId = PRICE_IDS[plan];
  if (!priceId) return res.status(400).json({ error: `No price configured for plan: ${plan}. Set STRIPE_${plan.toUpperCase()}_PRICE_ID env var.` });

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
    subscription_data: {
      trial_period_days: 14,
      metadata: { orgId, plan },
    },
    success_url: successUrl || `${req.headers.origin}/settings?subscribed=true`,
    cancel_url: cancelUrl || `${req.headers.origin}/settings`,
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
    return_url: returnUrl || `${req.headers.origin}/settings`,
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
