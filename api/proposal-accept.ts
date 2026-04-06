// ============================================================
// Proposal Accept API — Public endpoint for client acceptance
// No auth required — uses view_token for verification
// Handles: get proposal, accept (sign), create payment, verify
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action, token } = req.query;

  try {
    switch (action) {
      case "get": return await getProposal(token as string, res);
      case "accept": return await acceptProposal(req, res);
      case "verify-payment": return await verifyPayment(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

async function getProposal(token: string, res: VercelResponse) {
  if (!token) return res.status(400).json({ error: "Missing token" });

  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("view_token", token)
    .single();

  if (error || !proposal) return res.status(404).json({ error: "Proposal not found" });
  if (proposal.status === "void") return res.status(400).json({ error: "This proposal has been voided" });

  // Get org name + branding
  let orgName = "";
  let stripeConnected = false;
  if (proposal.org_id) {
    const { data: org } = await supabase.from("organizations").select("name, stripe_account_id").eq("id", proposal.org_id).single();
    orgName = org?.name || "";
    stripeConnected = !!org?.stripe_account_id;
  }

  const alreadyAccepted = !!proposal.accepted_at;

  return res.status(200).json({
    id: proposal.id,
    title: proposal.title,
    lineItems: proposal.line_items,
    subtotal: proposal.subtotal,
    taxRate: proposal.tax_rate,
    taxAmount: proposal.tax_amount,
    total: proposal.total,
    contractContent: proposal.contract_content,
    paymentConfig: proposal.payment_config,
    pages: proposal.pages || [],
    packages: proposal.packages || [],
    selectedPackageId: proposal.selected_package_id || null,
    paymentMilestones: proposal.payment_milestones || [],
    status: proposal.status,
    clientEmail: proposal.client_email,
    clientSignature: proposal.client_signature,
    ownerSignature: proposal.owner_signature,
    paidAt: proposal.paid_at,
    orgName,
    stripeConnected,
    alreadyAccepted,
  });
}

async function acceptProposal(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { token, signature, selectedPackageId } = req.body;
  if (!token || !signature) return res.status(400).json({ error: "Missing token or signature" });

  // Verify proposal exists and is in correct status
  const { data: proposal } = await supabase
    .from("proposals")
    .select("*")
    .eq("view_token", token)
    .single();

  if (!proposal) return res.status(404).json({ error: "Proposal not found" });
  if (proposal.accepted_at) return res.status(400).json({ error: "Already accepted" });
  if (proposal.status !== "sent") return res.status(400).json({ error: "Proposal is not available for acceptance" });

  // Add IP address to signature
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  const fullSignature = {
    ...signature,
    ip: Array.isArray(ip) ? ip[0] : ip,
    timestamp: new Date().toISOString(),
  };

  const now = new Date().toISOString();

  // Resolve selected package and milestones
  const packages = proposal.packages || [];
  const selectedPkg = selectedPackageId ? packages.find((p: any) => p.id === selectedPackageId) : packages[0] || null;
  const resolvedMilestones = selectedPkg?.paymentMilestones || [];
  const proposalTotal = selectedPkg?.totalPrice || proposal.total;

  // Update proposal
  const updatePayload: any = {
    client_signature: fullSignature,
    accepted_at: now,
    status: "accepted",
    pipeline_stage: "proposal_signed",
    updated_at: now,
  };
  if (selectedPackageId) updatePayload.selected_package_id = selectedPackageId;
  if (resolvedMilestones.length > 0) updatePayload.payment_milestones = resolvedMilestones;
  if (selectedPkg) updatePayload.total = proposalTotal;

  // Race condition guard: only update if still in "sent" status
  const { error: updateError, count } = await supabase.from("proposals").update(updatePayload).eq("id", proposal.id).eq("status", "sent");

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Check if payment required: first via milestones, then legacy paymentConfig
  const hasAtSigningMilestone = resolvedMilestones.some((m: any) => m.dueType === "at_signing");
  const paymentConfig = proposal.payment_config || { option: "none" };
  const needsPayment = hasAtSigningMilestone || paymentConfig.option !== "none";

  if (needsPayment) {
    // Get org's connected Stripe account
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_account_id, name")
      .eq("id", proposal.org_id)
      .single();

    if (!org?.stripe_account_id) {
      return res.status(200).json({
        success: true,
        paymentRequired: true,
        paymentError: "Payment processing not set up. Contact the sender.",
      });
    }

    // Calculate payment amount — milestones first, then legacy
    let paymentAmount = proposalTotal;
    let paymentLabel = "Full Payment";
    if (hasAtSigningMilestone) {
      const ms = resolvedMilestones.find((m: any) => m.dueType === "at_signing");
      if (ms.type === "percent") {
        paymentAmount = Math.round(proposalTotal * (ms.percent / 100) * 100) / 100;
        paymentLabel = `${ms.label} (${ms.percent}%)`;
      } else {
        paymentAmount = ms.fixedAmount || proposalTotal;
        paymentLabel = ms.label;
      }
    } else if (paymentConfig.option === "deposit") {
      paymentAmount = Math.round(proposalTotal * (paymentConfig.depositPercent / 100) * 100) / 100;
      paymentLabel = `Deposit (${paymentConfig.depositPercent}%)`;
    }

    try {
      // Validate origin to prevent open redirect
      const allowedHost = process.env.VERCEL_URL || process.env.VITE_APP_URL || "";
      const rawOrigin = req.headers.origin || req.headers.referer?.replace(/\/[^/]*$/, "") || "";
      const origin = (rawOrigin && (rawOrigin.includes("sdubmedia") || rawOrigin.includes("localhost") || rawOrigin.includes("vercel.app"))) ? rawOrigin : `https://${allowedHost}`;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: proposal.title,
              description: `${paymentLabel} — ${org.name || ""}`,
            },
            unit_amount: Math.round(paymentAmount * 100),
          },
          quantity: 1,
        }],
        metadata: {
          proposalId: proposal.id,
          type: "proposal",
        },
        success_url: `${origin}/proposal/${token}?paid=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/proposal/${token}`,
      }, {
        stripeAccount: org.stripe_account_id,
      });

      // Store session ID on proposal
      await supabase.from("proposals").update({
        stripe_session_id: session.id,
      }).eq("id", proposal.id);

      return res.status(200).json({
        success: true,
        paymentRequired: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (stripeErr: any) {
      return res.status(500).json({
        success: false,
        paymentRequired: true,
        paymentError: stripeErr.message || "Failed to create payment session",
      });
    }
  }

  return res.status(200).json({ success: true, paymentRequired: false });
}

async function verifyPayment(req: VercelRequest, res: VercelResponse) {
  const { token, sessionId } = req.query;
  if (!token || !sessionId) return res.status(400).json({ error: "Missing token or sessionId" });

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, org_id")
    .eq("view_token", token as string)
    .single();

  if (!proposal) return res.status(404).json({ error: "Proposal not found" });

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_account_id")
    .eq("id", proposal.org_id)
    .single();

  if (!org?.stripe_account_id) return res.status(400).json({ error: "Stripe not connected" });

  const session = await stripe.checkout.sessions.retrieve(sessionId as string, {
    stripeAccount: org.stripe_account_id,
  });

  if (session.payment_status === "paid") {
    const now = new Date().toISOString();
    await supabase.from("proposals").update({
      paid_at: now,
      updated_at: now,
    }).eq("id", proposal.id);

    return res.status(200).json({ paid: true });
  }

  return res.status(200).json({ paid: false });
}
