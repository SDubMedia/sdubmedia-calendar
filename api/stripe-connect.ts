// ============================================================
// Stripe Connect — Let customers connect their Stripe account
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth } from "./_auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { action } = req.query;

  try {
    switch (action) {
      case "connect": return await createConnectLink(req, res);
      case "callback": return await handleCallback(req, res);
      case "status": return await getStatus(req, res);
      case "disconnect": return await disconnect(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Create a Stripe Connect onboarding link
async function createConnectLink(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { orgId, returnUrl } = req.body;
  if (!orgId) return res.status(400).json({ error: "Missing orgId" });

  // Check if org already has a connected account
  const { data: org, error: orgError } = await supabase.from("organizations").select("*").eq("id", orgId).single();
  if (orgError) return res.status(500).json({ error: `DB error: ${orgError.message}` });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  let accountId = org.stripe_account_id;

  if (!accountId) {
    // Create a new Connect account
    const account = await stripe.accounts.create({ type: "standard" });
    accountId = account.id;

    // Save to org
    const { error: updateError } = await supabase.from("organizations").update({ stripe_account_id: accountId }).eq("id", orgId);
    if (updateError) return res.status(500).json({ error: `Failed to save: ${updateError.message}` });
  }

  // Create onboarding link
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: returnUrl || `${req.headers.origin}/settings`,
    return_url: returnUrl || `${req.headers.origin}/settings`,
    type: "account_onboarding",
  });

  return res.status(200).json({ url: link.url, accountId });
}

// Handle callback after Stripe Connect onboarding
async function handleCallback(req: VercelRequest, res: VercelResponse) {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: "Missing orgId" });

  const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", orgId).single();
  if (!org?.stripe_account_id) return res.status(400).json({ error: "No connected account" });

  const account = await stripe.accounts.retrieve(org.stripe_account_id);

  return res.status(200).json({
    connected: account.charges_enabled && account.payouts_enabled,
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  });
}

// Get Stripe Connect status
async function getStatus(req: VercelRequest, res: VercelResponse) {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: "Missing orgId" });

  const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", orgId).single();
  if (!org?.stripe_account_id) {
    return res.status(200).json({ connected: false });
  }

  try {
    const account = await stripe.accounts.retrieve(org.stripe_account_id);
    return res.status(200).json({
      connected: account.charges_enabled && account.payouts_enabled,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });
  } catch {
    return res.status(200).json({ connected: false });
  }
}

// Disconnect Stripe account
async function disconnect(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { orgId } = req.body;
  if (!orgId) return res.status(400).json({ error: "Missing orgId" });

  await supabase.from("organizations").update({ stripe_account_id: null }).eq("id", orgId);
  return res.status(200).json({ ok: true });
}
