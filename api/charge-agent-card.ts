// ============================================================
// Charge an AGENT's saved card on file for an invoice the broker didn't cover.
// Owner-only, off-session (no action needed from the agent — their booking &
// payment agreement authorizes this). The card + customer live on the org's
// connected Stripe account. On success the invoice is marked paid and its
// linked projects stamped paid_date, mirroring the Checkout/webhook paths.
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

  const { invoiceId } = req.body ?? {};
  if (!invoiceId || typeof invoiceId !== "string") return res.status(400).json({ error: "Missing invoiceId" });

  try {
    // Owner only.
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only the owner can charge a card" });
    const orgId = await getUserOrgId(caller.userId);

    // Invoice must belong to the caller's org and still be owed.
    const { data: invoice } = await supabase
      .from("invoices").select("id, org_id, client_id, total, status, line_items, invoice_number")
      .eq("id", invoiceId).maybeSingle();
    if (!invoice || invoice.org_id !== orgId) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === "paid") return res.status(400).json({ error: "Invoice is already paid" });
    if (invoice.status === "void") return res.status(400).json({ error: "Invoice is void" });
    if (!(Number(invoice.total) > 0)) return res.status(400).json({ error: "Nothing to charge on this invoice" });

    // The payer must be an agent with a saved card.
    const { data: agent } = await supabase
      .from("clients").select("id, client_type, card_on_file, stripe_customer_id, company, contact_name")
      .eq("id", invoice.client_id).eq("org_id", orgId).maybeSingle();
    if (!agent) return res.status(400).json({ error: "This invoice isn't billed to an agent" });
    if (agent.client_type !== "agent") return res.status(400).json({ error: "Card charging is for agent invoices only" });
    if (!agent.card_on_file || !agent.stripe_customer_id) return res.status(400).json({ error: "This agent has no card on file" });

    const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", orgId).single();
    if (!org?.stripe_account_id) return res.status(400).json({ error: "Payments aren't set up for this account" });
    const acct = org.stripe_account_id as string;

    // All saved cards, newest first. We try them in order so that if a recently
    // added card fails (declined, empty prepaid, needs 3DS), an older still-valid
    // card on file is used automatically — replacing a card with a bad one can
    // never strand the charge or "lose" the working card.
    const pms = await stripe.paymentMethods.list(
      { customer: agent.stripe_customer_id as string, type: "card", limit: 10 },
      { stripeAccount: acct }
    );
    if (pms.data.length === 0) return res.status(400).json({ error: "No saved card found for this agent" });

    const amount = Math.round(Number(invoice.total) * 100);
    let intent: Stripe.PaymentIntent | null = null;
    let chargedLast4: string | null = null;
    let lastErr = "The card couldn't be charged";
    for (const pm of pms.data) {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount,
            currency: "usd",
            customer: agent.stripe_customer_id as string,
            payment_method: pm.id,
            off_session: true,
            confirm: true,
            metadata: { invoiceId: invoice.id, kind: "agent_card_charge", clientId: agent.id },
          },
          { stripeAccount: acct }
        );
        if (pi.status === "succeeded") { intent = pi; chargedLast4 = pm.card?.last4 ?? null; break; }
        lastErr = `Charge ${pi.status.replace(/_/g, " ")}`;
      } catch (err) {
        // Declined / needs the agent present (3DS) — remember it and try the
        // next saved card. A declined off-session intent never captures funds.
        lastErr = (err as Stripe.errors.StripeError)?.message || lastErr;
      }
    }

    if (!intent) {
      return res.status(402).json({ error: `${lastErr} — try a payment link instead`, needsPaymentLink: true });
    }

    // Mark the invoice paid + stamp its linked projects (mirrors stripe-payment).
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("invoices").update({ status: "paid", paid_date: today }).eq("id", invoice.id);
    const projectIds = Array.isArray(invoice.line_items)
      ? (invoice.line_items as { projectId?: string }[]).map(li => li.projectId).filter(Boolean) as string[]
      : [];
    for (const pid of projectIds) {
      await supabase.from("projects").update({ paid_date: today }).eq("id", pid);
    }

    return res.status(200).json({ ok: true, amount: Number(invoice.total), last4: chargedLast4 });
  } catch (err) {
    console.error("charge-agent-card error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't charge the card") });
  }
}
