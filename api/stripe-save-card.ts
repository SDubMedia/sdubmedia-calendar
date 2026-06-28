// ============================================================
// Stripe — an AGENT saves a card on file (setup mode, NOT charged). Required
// before they can request shoots; a fallback if their broker doesn't pay. The
// card lives on the org's connected Stripe account; the owner charges manually.
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
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: profile } = await supabase.from("user_profiles").select("role, client_ids").eq("id", caller.userId).single();
    if (!profile || profile.role !== "client") return res.status(403).json({ error: "Only a client can do this" });
    const orgId = await getUserOrgId(caller.userId);
    const clientIds: string[] = Array.isArray(profile.client_ids) ? profile.client_ids : [];

    // The agent's own client record.
    const { data: agent } = await supabase
      .from("clients").select("id, company, contact_name, email, client_type, stripe_customer_id")
      .in("id", clientIds).eq("org_id", orgId).in("client_type", ["agent", "photography"]).maybeSingle();
    if (!agent) return res.status(403).json({ error: "Only a client can add a card" });

    const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", orgId).single();
    if (!org?.stripe_account_id) return res.status(400).json({ error: "Payments aren't set up for this account yet" });

    // Reuse or create the agent's customer on the connected account.
    let customerId = agent.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: agent.email || undefined, name: agent.company || agent.contact_name || undefined, metadata: { clientId: agent.id } },
        { stripeAccount: org.stripe_account_id }
      );
      customerId = customer.id;
      await supabase.from("clients").update({ stripe_customer_id: customerId }).eq("id", agent.id);
    }

    const origin = (typeof req.body?.successUrl === "string" && isAllowedUrl(req.body.successUrl)) ? req.body.successUrl : `${APP_URL}/my-houses?card=1`;
    const cancel = (typeof req.body?.cancelUrl === "string" && isAllowedUrl(req.body.cancelUrl)) ? req.body.cancelUrl : `${APP_URL}/my-houses`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "setup",
        customer: customerId,
        payment_method_types: ["card"],
        metadata: { kind: "agent_card", clientId: agent.id },
        success_url: origin,
        cancel_url: cancel,
      },
      { stripeAccount: org.stripe_account_id }
    );

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("stripe-save-card error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't start card setup") });
  }
}
