// ============================================================
// Proposal Accept API — Public endpoint for client acceptance
// No auth required — uses view_token for verification
// Handles: get proposal, accept (sign), create payment, verify
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { errorMessage, escapeHtml } from "./_auth.js";
import { generateContractContent } from "./_contractGenerator.js";
import { extractPaymentScheduleMilestones, type PartialMilestone } from "./_paymentSchedule.js";
import { nanoid } from "nanoid";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action, token } = req.query;

  try {
    switch (action) {
      case "get": return await getProposal(token as string, res);
      case "accept": return await acceptProposal(req, res);
      case "verify-payment": return await verifyPayment(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
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
  type Milestone = { dueType: string; type: "percent" | "fixed"; percent?: number; amount?: number; label: string };
  type Package = { id: string; totalPrice?: number; paymentMilestones?: Milestone[] };
  const packages: Package[] = proposal.packages || [];
  const selectedPkg = selectedPackageId ? packages.find(p => p.id === selectedPackageId) : packages[0] || null;
  const resolvedMilestones: Milestone[] = selectedPkg?.paymentMilestones || [];
  const proposalTotal = selectedPkg?.totalPrice || proposal.total;

  // Update proposal
  const updatePayload: Record<string, unknown> = {
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
  if (count === 0) return res.status(409).json({ error: "Proposal already accepted" });

  // ---------- Phase A: auto-generate draft contract ----------
  // If the proposal links to a master contract template, render a draft
  // contract from the master + selected packages and drop it in the owner's
  // approval queue. Deposit collection moves to contract signing time.
  // Legacy proposals (no contract_template_id) keep the old immediate-Stripe
  // flow below for backward compat.
  if (proposal.contract_template_id) {
    try {
      const draftId = await generateDraftContractFromProposal(
        proposal,
        selectedPkg,
        resolvedMilestones,
        proposalTotal,
      );
      // Fire-and-forget owner notification with deep-link to review the draft.
      // Critical for conversion — without it, owners don't know to act.
      // Errors don't block the client's success response.
      const signerName = signature.name || proposal.client_email || "Your client";
      notifyOwnerContractReady(proposal.org_id, draftId, proposal.title, signerName, proposalTotal)
        .catch(err => console.error(`[proposal-accept] owner notify failed: ${errorMessage(err)}`));
      return res.status(200).json({
        success: true,
        paymentRequired: false,
        contractDraftCreated: true,
        contractDraftId: draftId,
        message: "We'll review your selections and send your contract for signature within 24 hours.",
      });
    } catch (err) {
      // If contract generation fails, surface to the client but do NOT roll
      // back the proposal acceptance — the owner can still manually create
      // a contract from the queue.
      return res.status(200).json({
        success: true,
        paymentRequired: false,
        contractDraftCreated: false,
        message: `Acceptance recorded. (Draft contract generation deferred: ${errorMessage(err)})`,
      });
    }
  }

  // ---------- Legacy flow: immediate Stripe Checkout ----------
  // Check if payment required: first via milestones, then legacy paymentConfig
  const hasAtSigningMilestone = resolvedMilestones.some(m => m.dueType === "at_signing");
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
      const ms = resolvedMilestones.find(m => m.dueType === "at_signing")!;
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
    } catch (stripeErr) {
      return res.status(500).json({
        success: false,
        paymentRequired: true,
        paymentError: errorMessage(stripeErr, "Failed to create payment session"),
      });
    }
  }

  // Notify owner
  notifyOwner(proposal.org_id, proposal.title, signature.name || proposal.client_email, "signed").catch(() => {});

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

async function notifyOwner(orgId: string, title: string, signerName: string, event: "signed" | "viewed") {
  if (!orgId) return;
  const { data: profiles } = await supabase.from("user_profiles").select("email").eq("org_id", orgId).eq("role", "owner");
  const ownerEmail = profiles?.[0]?.email;
  if (!ownerEmail) return;
  const subject = event === "signed" ? `Proposal Signed: ${title}` : `Proposal Viewed: ${title}`;
  const body = event === "signed"
    ? `<strong>${signerName}</strong> has signed your proposal: <strong>${title}</strong>. Log in to Slate to countersign.`
    : `<strong>${signerName}</strong> has viewed your proposal: <strong>${title}</strong>.`;
  await resend.emails.send({
    from: FROM_EMAIL, to: ownerEmail, subject,
    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;"><h2 style="color:#0088ff;">Proposal ${event === "signed" ? "Signed" : "Viewed"}!</h2><p style="color:#1e293b;">${body}</p></div>`,
  });
}

/**
 * Notify the owner that a proposal was accepted AND a draft contract is now
 * waiting in the approval queue. Deep-links to the review page so they can
 * one-tap into "approve and send" or "edit before sending". This is the
 * critical conversion-driver email — without it, owners don't know to act
 * and deals cool off.
 */
async function notifyOwnerContractReady(
  orgId: string,
  contractId: string,
  proposalTitle: string,
  signerName: string,
  total: number,
) {
  if (!orgId) return;
  const { data: profiles } = await supabase.from("user_profiles").select("email").eq("org_id", orgId).eq("role", "owner");
  const ownerEmail = profiles?.[0]?.email;
  if (!ownerEmail) return;
  const appBase = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";
  const reviewUrl = `${appBase}/contracts/${contractId}/review`;
  const subject = `${signerName} accepted — contract ready for review`;
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#059669;">Proposal accepted ✓</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">${escapeHtml(signerName)} just accepted <strong>${escapeHtml(proposalTitle)}</strong>${total ? ` for $${total.toFixed(2)}` : ""}.</p>
    <p style="margin:0 0 16px;font-size:14px;">A draft contract has been auto-generated from their selections and is waiting in your approval queue. Review and send for signature in one tap.</p>
    <p style="margin:24px 0;"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Review draft contract</a></p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">The faster you send, the higher your conversion rate. Most clients sign within hours of receiving the contract email.</p>
  </body></html>`;
  await resend.emails.send({
    from: FROM_EMAIL,
    to: ownerEmail,
    subject,
    html,
  });
}

// ============================================================
// Phase A — auto-generate draft contract from accepted proposal.
// ============================================================

interface PartialPackage {
  id: string;
  name?: string;
  description?: string;
  totalPrice?: number;
  defaultPrice?: number;
  discountFromPrice?: number | null;
  lineItems?: Array<{ description?: string; quantity?: number; unitPrice?: number }>;
}


async function generateDraftContractFromProposal(
  proposal: Record<string, unknown>,
  selectedPkg: PartialPackage | null,
  milestones: PartialMilestone[],
  total: number,
): Promise<string> {
  // 1. Load the master contract template
  const { data: tpl, error: tplErr } = await supabase
    .from("contract_templates")
    .select("*")
    .eq("id", proposal.contract_template_id)
    .single();
  if (tplErr || !tpl) throw new Error("Linked contract template not found");

  // 2. Load org info for vendor merge fields
  const { data: org } = await supabase
    .from("organizations")
    .select("name, business_info")
    .eq("id", proposal.org_id)
    .single();
  const businessInfo = (org?.business_info as Record<string, string> | undefined) || {};

  // 3. Load client info if linked
  let clientName = "";
  let clientEmail = proposal.client_email || "";
  let clientAddress = "";
  let clientPhone = "";
  if (proposal.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("company, contact_name, email, phone, address, city, state, zip")
      .eq("id", proposal.client_id)
      .single();
    if (client) {
      clientName = client.contact_name || client.company || "";
      clientEmail = client.email || clientEmail;
      clientPhone = client.phone || "";
      const addressBits = [client.address, client.city, client.state, client.zip].filter(Boolean);
      clientAddress = addressBits.join(", ");
    }
  }

  // 4. Project info — pull project date/location if a project is linked
  let eventDate = "";
  let eventLocation = "";
  if (proposal.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("date, location_id")
      .eq("id", proposal.project_id)
      .single();
    if (project) {
      eventDate = project.date || "";
      if (project.location_id) {
        const { data: loc } = await supabase
          .from("locations")
          .select("name, address, city, state, zip")
          .eq("id", project.location_id)
          .single();
        if (loc) {
          eventLocation = loc.name || `${loc.address || ""} ${loc.city || ""}`.trim();
        }
      }
    }
  }

  // 5. Build the input for the renderer
  const selectedPackages = selectedPkg ? [{
    id: selectedPkg.id,
    name: selectedPkg.name || "",
    description: selectedPkg.description || "",
    defaultPrice: Number(selectedPkg.defaultPrice ?? selectedPkg.totalPrice ?? 0),
    totalPrice: Number(selectedPkg.totalPrice ?? selectedPkg.defaultPrice ?? 0),
    discountFromPrice: selectedPkg.discountFromPrice ?? null,
    quantity: 1,
  }] : [];

  // If the template defines payment_schedule blocks, those override the
  // legacy package-based milestones. Lets the master contract own the
  // payment terms, which is the new flow Geoff wants.
  const blockMilestones = extractPaymentScheduleMilestones(tpl.blocks, eventDate, total);
  const finalMilestones = blockMilestones.length > 0
    ? blockMilestones
    : milestones.map(m => ({
        label: m.label || "",
        type: m.type || "fixed",
        percent: m.percent,
        fixedAmount: m.fixedAmount,
        amount: m.amount,
        dueType: m.dueType || "at_signing",
        dueDays: m.dueDays,
        dueDate: m.dueDate,
      }));

  const renderedHtml = generateContractContent({
    masterTemplateHtml: tpl.content || "",
    proposalTitle: proposal.title || "",
    clientName, clientEmail, clientAddress, clientPhone,
    vendorName: org?.name || businessInfo.companyName || "",
    vendorEmail: businessInfo.email || "",
    vendorAddress: [businessInfo.address, businessInfo.city, businessInfo.state, businessInfo.zip].filter(Boolean).join(", "),
    vendorPhone: businessInfo.phone || "",
    vendorSignerName: businessInfo.ownerName || "",
    eventDate, eventLocation,
    selectedPackages,
    totalPrice: total,
    milestones: finalMilestones,
  });

  // Assign stable IDs to each milestone so the Stripe webhook + payment
  // reminders cron can address them individually for paidAt stamping.
  const stampedMilestones = finalMilestones.map((m, i) => ({
    ...m,
    id: `ms_${nanoid(6)}_${i}`,
  }));

  // 6. INSERT the draft contract row
  const id = `ctr_${Date.now()}_${nanoid(6)}`;
  const signToken = nanoid(32);
  const now = new Date().toISOString();
  const { error: insErr } = await supabase.from("contracts").insert({
    id,
    org_id: proposal.org_id,
    template_id: tpl.id,
    proposal_id: proposal.id,
    master_template_version_id: `${tpl.id}@${tpl.updated_at || tpl.created_at}`,
    client_id: proposal.client_id || null,
    project_id: proposal.project_id || null,
    title: proposal.title || tpl.name,
    content: renderedHtml,
    status: "draft",
    client_email: clientEmail,
    sign_token: signToken,
    field_values: {},
    additional_signers: [],
    payment_milestones: stampedMilestones,
    document_expires_at: null,
    reminders_enabled: false,
    firing_log: [],
    send_back_reason: "",
    updated_at: now,
  });
  if (insErr) throw new Error(insErr.message);
  return id;
}

