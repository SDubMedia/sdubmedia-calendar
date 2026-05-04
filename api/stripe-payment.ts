// ============================================================
// Stripe Payment — Create payment links for invoices
// Payments go to the customer's connected Stripe account
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action } = req.query;

  // Public, token-gated path for the client-facing invoice page. No
  // auth — the view_token is the secret. Same pattern proposals + the
  // contract sign flow already use. The Stripe webhook authoritatively
  // marks invoices paid; the success_url just bounces the client back
  // to the public page with ?paid=1 for confirmation copy.
  if (action === "checkout-by-token") {
    if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
    try {
      return await createCheckoutByToken(req, res);
    } catch (err) {
      return res.status(500).json({ error: errorMessage(err) });
    }
  }

  // Authed, owner-scoped path (legacy — kept for any internal callers).
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const callerOrgId = await getUserOrgId(user.userId);

  // Verify org ownership
  const requestOrgId = (req.body?.orgId || req.query.orgId) as string;
  if (requestOrgId && callerOrgId !== requestOrgId) {
    return res.status(403).json({ error: "Access denied — org mismatch" });
  }

  try {
    switch (action) {
      case "create-checkout": return await createCheckout(req, res);
      case "verify-payment": return await verifyPayment(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }
}

// Create a Stripe Checkout session given just a public view_token.
async function createCheckoutByToken(req: VercelRequest, res: VercelResponse) {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const successUrl = typeof req.body?.successUrl === "string" ? req.body.successUrl : "";
  const cancelUrl = typeof req.body?.cancelUrl === "string" ? req.body.cancelUrl : "";
  if (!token) return res.status(400).json({ error: "Missing token" });

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("view_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", invoice.org_id).single();
  if (!org?.stripe_account_id) {
    return res.status(400).json({ error: "Stripe is not connected on this account." });
  }

  const clientInfo = invoice.client_info || {};
  const origin = req.headers.origin || `https://slate.sdubmedia.com`;
  const fallbackSuccess = `${origin}/invoice/${token}?paid=1`;
  const fallbackCancel = `${origin}/invoice/${token}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `Invoice ${invoice.invoice_number}`,
          description: `${clientInfo.company || "Client"} — Service period ${invoice.period_start} to ${invoice.period_end}`,
        },
        unit_amount: Math.round(invoice.total * 100),
      },
      quantity: 1,
    }],
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    },
    success_url: (successUrl && isAllowedUrl(successUrl)) ? successUrl : fallbackSuccess,
    cancel_url: (cancelUrl && isAllowedUrl(cancelUrl)) ? cancelUrl : fallbackCancel,
  }, {
    stripeAccount: org.stripe_account_id,
  });

  return res.status(200).json({ url: session.url, sessionId: session.id });
}

// Create a Stripe Checkout session for an invoice
async function createCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { invoiceId, orgId, successUrl, cancelUrl } = req.body;
  if (!invoiceId || !orgId) return res.status(400).json({ error: "Missing invoiceId or orgId" });

  // Get the org's connected Stripe account
  const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", orgId).single();
  if (!org?.stripe_account_id) {
    return res.status(400).json({ error: "Stripe not connected. Connect your Stripe account in Settings." });
  }

  // Get invoice details
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const clientInfo = invoice.client_info || {};

  // Create Checkout session on the connected account
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `Invoice ${invoice.invoice_number}`,
          description: `${clientInfo.company || "Client"} — Service period ${invoice.period_start} to ${invoice.period_end}`,
        },
        unit_amount: Math.round(invoice.total * 100), // cents
      },
      quantity: 1,
    }],
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    },
    success_url: (successUrl && isAllowedUrl(successUrl)) ? successUrl : `${req.headers.origin}/invoices?paid=${invoiceId}`,
    cancel_url: (cancelUrl && isAllowedUrl(cancelUrl)) ? cancelUrl : `${req.headers.origin}/invoices`,
  }, {
    stripeAccount: org.stripe_account_id,
  });

  return res.status(200).json({ url: session.url, sessionId: session.id });
}

// Verify a payment was completed
async function verifyPayment(req: VercelRequest, res: VercelResponse) {
  const { sessionId, orgId } = req.query;
  if (!sessionId || !orgId) return res.status(400).json({ error: "Missing sessionId or orgId" });

  const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", orgId).single();
  if (!org?.stripe_account_id) return res.status(400).json({ error: "Stripe not connected" });

  const session = await stripe.checkout.sessions.retrieve(sessionId as string, {
    stripeAccount: org.stripe_account_id,
  });

  if (session.payment_status === "paid" && session.metadata?.invoiceId) {
    // Mark invoice as paid
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("invoices").update({
      status: "paid",
      paid_date: today,
    }).eq("id", session.metadata.invoiceId);

    // Mark linked projects as paid
    const { data: invoice } = await supabase.from("invoices").select("line_items").eq("id", session.metadata.invoiceId).single();
    if (invoice?.line_items) {
      const projectIds = (invoice.line_items as { projectId?: string }[]).map(li => li.projectId).filter(Boolean);
      for (const pid of projectIds) {
        await supabase.from("projects").update({ paid_date: today }).eq("id", pid);
      }
    }

    return res.status(200).json({ paid: true, invoiceId: session.metadata.invoiceId });
  }

  return res.status(200).json({ paid: false });
}
