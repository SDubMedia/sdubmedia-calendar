// ============================================================
// Confirm an agent's saved card by checking Stripe directly — the reliable
// counterpart to the async webhook. Called when the agent returns from the
// setup Checkout (?card=1). Looks up their Stripe customer on the org's
// connected account; if a card is attached, stamps card_on_file + brand/last4
// so the booking gate clears immediately, without depending on webhook timing.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: profile } = await supabase.from("user_profiles").select("role, client_ids").eq("id", caller.userId).single();
    if (!profile || profile.role !== "client") return res.status(403).json({ error: "Only an agent can do this" });
    const orgId = await getUserOrgId(caller.userId);
    const clientIds: string[] = Array.isArray(profile.client_ids) ? profile.client_ids : [];

    const { data: agent } = await supabase
      .from("clients").select("id, stripe_customer_id, org_id")
      .in("id", clientIds).eq("org_id", orgId).eq("client_type", "agent").maybeSingle();
    if (!agent) return res.status(403).json({ error: "Only an agent can confirm a card" });
    if (!agent.stripe_customer_id) return res.status(200).json({ cardOnFile: false });

    const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", agent.org_id).maybeSingle();
    const acct = org?.stripe_account_id as string | undefined;
    if (!acct) return res.status(200).json({ cardOnFile: false });

    // Most-recent card on the connected account (Stripe returns newest first).
    const pms = await stripe.paymentMethods.list(
      { customer: agent.stripe_customer_id as string, type: "card", limit: 1 },
      { stripeAccount: acct }
    );
    const card = pms.data[0]?.card;
    if (!card) return res.status(200).json({ cardOnFile: false });

    await supabase.from("clients").update({
      card_on_file: true,
      card_brand: card.brand,
      card_last4: card.last4,
    }).eq("id", agent.id);

    return res.status(200).json({ cardOnFile: true, brand: card.brand, last4: card.last4 });
  } catch (err) {
    console.error("confirm-card error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't confirm the card") });
  }
}
