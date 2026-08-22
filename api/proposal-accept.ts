// ============================================================
// Proposal Accept API — Public endpoint for client acceptance
// No auth required — uses view_token for verification
// Handles: get proposal, accept (sign), create payment, verify
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { errorMessage, escapeHtml, publicBusinessInfo } from "./_auth.js";
import { sendPushToOwner } from "./_apns.js";
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
  // Expired-link guard. Owners can optionally set expires_at when sending;
  // we treat anything past that timestamp as expired so old links can't be
  // re-used long after the deal cooled. Already-accepted proposals bypass
  // this so the client can still see what they signed.
  if (proposal.expires_at && !proposal.accepted_at) {
    const expired = new Date(proposal.expires_at).getTime() < Date.now();
    if (expired) {
      return res.status(410).json({
        error: "This proposal link has expired. Please contact the sender for a new link.",
        expired: true,
      });
    }
  }

  // Get org name + branding (logo + business info shown on the public
  // proposal page as a header + footer so the proposal feels branded).
  let orgName = "";
  let orgLogo = "";
  let orgBusinessInfo: Record<string, unknown> | null = null;
  let stripeConnected = false;
  if (proposal.org_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, logo_url, business_info, stripe_account_id")
      .eq("id", proposal.org_id)
      .single();
    orgName = org?.name || "";
    orgLogo = org?.logo_url || "";
    // Redacted: this object goes to anyone holding the proposal link.
    orgBusinessInfo = publicBusinessInfo(org?.business_info);
    stripeConnected = !!org?.stripe_account_id;
  }

  const alreadyAccepted = !!proposal.accepted_at;

  // The org's package library, in the shape the block renderer expects.
  // Without this, every package_row and package_group in a proposal rendered
  // "package not found" for the client and priced at zero — the blocks resolve
  // packages by id at render time and this payload never carried them.
  const { data: pkgRows } = await supabase
    .from("packages")
    .select("id, name, icon, icon_custom_data_url, description, default_price, discount_from_price, photo_data_url, deliverables")
    .eq("org_id", proposal.org_id)
    .is("deleted_at", null);
  const libraryPackages = (pkgRows || []).map(p => ({
    id: p.id,
    name: p.name || "",
    icon: p.icon || "",
    iconCustomDataUrl: p.icon_custom_data_url || "",
    description: p.description || "",
    defaultPrice: p.default_price || 0,
    discountFromPrice: p.discount_from_price || 0,
    photoDataUrl: p.photo_data_url || "",
    deliverables: Array.isArray(p.deliverables) ? p.deliverables : [],
  }));

  // The linked agreement, so it can be read BEFORE signing rather than only
  // appearing as a generated contract afterwards. Read-only here: the binding
  // copy is still the one generated on acceptance, with merge fields resolved.
  let agreementPreview: { label: string; pages: unknown[]; content: string } | null = null;
  if (proposal.contract_template_id) {
    const { data: ctpl } = await supabase
      .from("contract_templates")
      .select("name, pages, blocks, content")
      .eq("id", proposal.contract_template_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (ctpl) {
      agreementPreview = {
        label: ctpl.name || "Agreement",
        pages: Array.isArray(ctpl.pages) ? ctpl.pages : [],
        content: typeof ctpl.content === "string" ? ctpl.content : "",
      };
    }
  }

  return res.status(200).json({
    libraryPackages,
    agreementPreview,
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
    selectedPackageIds: Array.isArray(proposal.selected_package_ids) ? proposal.selected_package_ids : [],
    paymentMilestones: proposal.payment_milestones || [],
    status: proposal.status,
    clientEmail: proposal.client_email,
    // Values the owner already knows (event date, venue) or the client
    // previously submitted. The viewer treats non-empty entries as known:
    // it prefills them into the agreement and stops asking for them.
    clientFieldValues: (proposal.client_field_values && typeof proposal.client_field_values === "object" && !Array.isArray(proposal.client_field_values))
      ? proposal.client_field_values : {},
    clientSignature: proposal.client_signature,
    acceptedAt: proposal.accepted_at || null,
    ownerSignature: proposal.owner_signature,
    paidAt: proposal.paid_at,
    orgName,
    orgLogo,
    orgBusinessInfo,
    stripeConnected,
    alreadyAccepted,
  });
}

async function acceptProposal(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { token, signature, selectedPackageId, selectedPackageIds, clientFields, additionalSignature } = req.body;
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
  // Expired-link guard — same logic as the get path so a stale tab can't
  // bypass by submitting after expiration.
  if (proposal.expires_at && new Date(proposal.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "This proposal link has expired. Please contact the sender for a new link." });
  }

  // Add IP address to signature
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  const fullSignature = {
    ...signature,
    ip: Array.isArray(ip) ? ip[0] : ip,
    timestamp: new Date().toISOString(),
  };

  const now = new Date().toISOString();

  // Resolve selected package and milestones
  // Mirrors PaymentMilestone in client/src/lib/types.ts. It said `amount` for
  // years while every writer stored `fixedAmount` — harmless only because the
  // code below happens to read the real field. api/ isn't typechecked, so
  // nothing caught the mismatch.
  type Milestone = { dueType: "at_signing" | "relative_days" | "absolute_date"; type: "percent" | "fixed"; percent?: number; fixedAmount?: number; label: string };
  type Package = { id: string; totalPrice?: number; paymentMilestones?: Milestone[] };
  const packages: Package[] = proposal.packages || [];
  const selectedPkg = selectedPackageId ? packages.find(p => p.id === selectedPackageId) : packages[0] || null;
  const resolvedMilestones: Milestone[] = selectedPkg?.paymentMilestones || [];

  // Grouped selections: price from the org's package library, on the server.
  // The browser sends ids, never amounts — a total posted by the client is a
  // total the client can edit, and this one becomes an invoice.
  const chosenIds: string[] = Array.isArray(selectedPackageIds)
    ? selectedPackageIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  let groupedTotal = 0;
  if (chosenIds.length > 0) {
    const { data: lib } = await supabase
      .from("packages").select("id, default_price")
      .eq("org_id", proposal.org_id).in("id", chosenIds)
      // Deleted packages price as nothing rather than as their old amount.
      .is("deleted_at", null);
    groupedTotal = (lib || []).reduce((sum: number, p: { default_price: number | null }) => sum + (p.default_price || 0), 0);
    // Ids that aren't in this org's library are dropped rather than trusted.
    if ((lib || []).length !== chosenIds.length) {
      console.warn(`proposal-accept: ${chosenIds.length - (lib || []).length} unknown package id(s) ignored on ${proposal.id}`);
    }
  }

  const proposalTotal = chosenIds.length > 0 ? groupedTotal : (selectedPkg?.totalPrice || proposal.total);

  // Update proposal
  const updatePayload: Record<string, unknown> = {
    client_signature: fullSignature,
    accepted_at: now,
    status: "accepted",
    pipeline_stage: "proposal_signed",
    updated_at: now,
  };
  if (selectedPackageId) updatePayload.selected_package_id = selectedPackageId;
  if (chosenIds.length > 0) {
    updatePayload.selected_package_ids = chosenIds;
    updatePayload.total = groupedTotal;
  }
  // The blanks the signer filled — event date, venue, their own details.
  // Strings only, and capped, because this is an unauthenticated endpoint
  // whose output ends up inside a legal document.
  if (clientFields && typeof clientFields === "object" && !Array.isArray(clientFields)) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(clientFields as Record<string, unknown>)) {
      if (typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(k)) clean[k] = v.slice(0, 500);
    }
    if (Object.keys(clean).length > 0) updatePayload.client_field_values = clean;
  }

  // A second person named on the agreement signs it too. Recorded in the same
  // shape as the primary signature so the contract can carry both.
  let extraSigner: { name: string; email: string; signatureData: string; signatureType: string; timestamp: string } | null = null;
  if (additionalSignature && typeof additionalSignature === "object") {
    const a = additionalSignature as Record<string, unknown>;
    const typed = typeof a.typedName === "string" ? a.typedName.trim().slice(0, 200) : "";
    if (typed) {
      extraSigner = {
        name: typeof a.name === "string" ? a.name.trim().slice(0, 200) : typed,
        email: typeof a.email === "string" ? a.email.trim().slice(0, 200) : "",
        signatureData: typed,
        signatureType: "typed",
        timestamp: now,
      };
      updatePayload.additional_signatures = [extraSigner];
    }
  }
  if (resolvedMilestones.length > 0) updatePayload.payment_milestones = resolvedMilestones;
  if (selectedPkg) updatePayload.total = proposalTotal;

  // Race condition guard: only update if still in "sent" status
  const { error: updateError, count } = await supabase.from("proposals").update(updatePayload).eq("id", proposal.id).eq("status", "sent");

  if (updateError) return res.status(500).json({ error: updateError.message });
  if (count === 0) return res.status(409).json({ error: "Proposal already accepted" });

  // Pipeline: the lead follows the deal — signed now, paid on verification.
  await supabase.from("pipeline_leads")
    .update({ pipeline_stage: "proposal_signed", recent_activity: `Signed by ${signature.name || "client"}`, recent_activity_at: now, updated_at: now })
    .eq("proposal_id", proposal.id)
    .is("deleted_at", null);

  // Calendar: one tentative project per confirmed coverage day, flipped to
  // upcoming + paid when the payment verifies. Never fails the acceptance.
  try {
    const mergedFields = {
      ...(proposal.client_field_values && typeof proposal.client_field_values === "object" ? proposal.client_field_values : {}),
      ...((updatePayload.client_field_values as Record<string, string>) || {}),
    } as Record<string, string>;
    await createProjectsForProposal(proposal, mergedFields, proposalTotal);
  } catch (err) {
    console.warn(`[proposal-accept] calendar projects failed: ${errorMessage(err, "unknown")}`);
  }

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
        // find() can come back undefined; the helper takes null for "none".
        selectedPkg ?? null,
        resolvedMilestones,
        proposalTotal,
        chosenIds,
        extraSigner,
      );
      // Owner notification with deep-link to review the draft. Critical for
      // conversion — without it, owners don't know to act. Awaited (Vercel
      // kills in-flight work once the handler returns) but never fails the
      // client's success response.
      const signerName = signature.name || proposal.client_email || "Your client";
      const notifyResults = await Promise.allSettled([
        notifyOwnerContractReady(proposal.org_id, draftId, proposal.title, signerName, proposalTotal),
        sendPushToOwner(proposal.org_id, {
          title: "Proposal signed",
          body: `${signerName} signed "${proposal.title}" — contract draft ready for review`,
        }),
      ]);
      notifyResults.forEach(r => {
        if (r.status === "rejected") console.error(`[proposal-accept] owner notify failed: ${errorMessage(r.reason)}`);
      });
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
        // Guard the percentage: a milestone saved without one would make this
        // NaN and fail the checkout with nothing useful to explain why.
        const pct = Number(ms.percent) || 0;
        paymentAmount = Math.round(proposalTotal * (pct / 100) * 100) / 100;
        paymentLabel = `${ms.label} (${pct}%)`;
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

      // The signature is already recorded, so the countersign nudge goes out
      // now — the client may abandon the checkout tab, and the owner should
      // still know they signed.
      await notifySignedAllChannels(proposal.org_id, proposal.title, signature.name || proposal.client_email);

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

  // Notify owner — awaited; see notifySignedAllChannels.
  await notifySignedAllChannels(proposal.org_id, proposal.title, signature.name || proposal.client_email);

  return res.status(200).json({ success: true, paymentRequired: false });
}

export const PROPOSAL_PAYMENT_SELECT = "id, org_id, client_id, title, line_items, subtotal, tax_rate, tax_amount, total, invoice_id, client_field_values, view_token, client_email, stripe_session_id, paid_at";

async function verifyPayment(req: VercelRequest, res: VercelResponse) {
  const { token, sessionId } = req.query;
  if (!token || !sessionId) return res.status(400).json({ error: "Missing token or sessionId" });

  const { data: proposal } = await supabase
    .from("proposals")
    .select(PROPOSAL_PAYMENT_SELECT)
    .eq("view_token", token as string)
    .single();

  if (!proposal) return res.status(404).json({ error: "Proposal not found" });

  // The session id in the query string is attacker-controlled; only the one
  // WE created for this proposal may verify it. Without this check, any paid
  // session on the connected account could mark any proposal paid.
  if (!proposal.stripe_session_id || proposal.stripe_session_id !== sessionId) {
    return res.status(400).json({ error: "Payment session does not match this proposal" });
  }

  // Already processed (page reload, double-tab): return the existing state
  // without re-running any side effect — no duplicate emails, no re-updates.
  if (proposal.invoice_id) {
    const { data: existing } = await supabase
      .from("invoices").select("view_token").eq("id", proposal.invoice_id).maybeSingle();
    return res.status(200).json({ paid: true, ...(existing?.view_token ? { invoiceToken: existing.view_token } : {}) });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_account_id, name, business_info")
    .eq("id", proposal.org_id)
    .single();

  if (!org?.stripe_account_id) return res.status(400).json({ error: "Stripe not connected" });

  const session = await stripe.checkout.sessions.retrieve(sessionId as string, {}, {
    // Third argument, not second: stripeAccount is a request option, not a
    // query param. stripe-node accepts it either way (it pops the last object
    // carrying an option key), but only this form typechecks.
    stripeAccount: org.stripe_account_id,
  });

  if (session.payment_status === "paid") {
    const invoiceToken = await processProposalPayment(proposal, org, session);
    return res.status(200).json({ paid: true, ...(invoiceToken ? { invoiceToken } : {}) });
  }

  return res.status(200).json({ paid: false });
}

/**
 * Everything that must happen once a proposal payment is confirmed. Shared
 * by verifyPayment (browser redirect) and the Stripe webhook (the durable
 * path when the client never returns from the checkout tab). Idempotent at
 * the caller via proposals.invoice_id.
 *
 * A deposit is NOT "paid in full": partial payments advance the pipeline to
 * retainer_paid and confirm the calendar, but only a full payment stamps
 * proposals.paid_at, projects.paid_date, and the paid-in-full language.
 */
export async function processProposalPayment(
  proposal: { id: string; org_id: string; client_id: string; title: string; line_items: unknown; subtotal: number; tax_rate: number; tax_amount: number; total: number; invoice_id: string | null; client_field_values?: Record<string, string> | null; view_token?: string; client_email?: string | null },
  org: { name?: string | null; business_info?: Record<string, unknown> | null },
  session: { amount_total?: number | null },
): Promise<string | null> {
  const now = new Date().toISOString();
  const paidAmount = Math.round(Number(session.amount_total ?? 0)) / 100;
  const fullyPaid = paidAmount > 0 && Math.abs(paidAmount - Number(proposal.total ?? 0)) < 0.01;

  await supabase.from("proposals").update({
    ...(fullyPaid ? { paid_at: now } : {}),
    updated_at: now,
  }).eq("id", proposal.id);

  await supabase.from("pipeline_leads")
    .update({
      pipeline_stage: "retainer_paid",
      recent_activity: fullyPaid ? "Paid in full via proposal" : `Deposit of $${paidAmount.toFixed(2)} paid via proposal`,
      recent_activity_at: now, updated_at: now,
    })
    .eq("proposal_id", proposal.id)
    .is("deleted_at", null);

  // Calendar: signed-tentative projects are confirmed by any payment;
  // paid_date only stamps when the balance is actually settled.
  await supabase.from("projects")
    .update({ status: "upcoming", ...(fullyPaid ? { paid_date: now.slice(0, 10) } : {}), updated_at: now })
    .eq("org_id", proposal.org_id)
    .eq("status", "tentative")
    .like("notes", `%[proposal:${proposal.id}]%`);

  const invoiceToken = await ensurePaidInvoice(proposal, org, session, fullyPaid);

  const balance = fullyPaid ? null : await ensureBalanceInvoice(proposal, org, paidAmount);

  try {
    await sendClientReceiptEmail(proposal, org, invoiceToken, session, fullyPaid, balance);
  } catch (err) {
    console.warn(`[proposal-accept] client receipt email failed: ${errorMessage(err, "unknown")}`);
  }

  return invoiceToken;
}

/**
 * Receipt email to the signer after a verified payment: amount, the signed
 * agreement (document view), and the paid invoice. Everything on-screen
 * survives in their inbox.
 */
async function sendClientReceiptEmail(
  proposal: { title: string; total: number; view_token?: string; client_email?: string | null },
  org: { name?: string | null },
  invoiceToken: string | null,
  session: { amount_total?: number | null },
  fullyPaid: boolean,
  balance: { dueIso: string; amount: number; viewToken: string } | null,
) {
  const to = String(proposal.client_email || "").trim();
  if (!to || !proposal.view_token) return;
  const appBase = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";
  const agreementUrl = `${appBase}/proposal/${proposal.view_token}?view=document`;
  const invoiceUrl = invoiceToken ? `${appBase}/invoice/${invoiceToken}` : "";
  const paid = Math.round(Number(session.amount_total ?? 0)) / 100;
  const orgName = org.name || "Your provider";
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${fullyPaid ? "Payment received" : "Deposit received"} — ${proposal.title || "your booking"}`,
    html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;">
      <h2 style="margin:0 0 4px;font-size:18px;color:#059669;">${fullyPaid ? "Payment received" : "Deposit received"} ✓</h2>
      <p style="margin:0 0 16px;color:#64748b;font-size:14px;">Thank you! Your ${fullyPaid ? "payment" : "deposit"}${paid ? ` of $${paid.toFixed(2)}` : ""} for <strong>${escapeHtml(proposal.title || "")}</strong> has been received, and your booking is confirmed.${fullyPaid ? "" : balance ? ` The remaining balance of $${balance.amount.toFixed(2)} is due ${balance.dueIso ? new Date(balance.dueIso + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "before the event"} — we'll email the invoice with a payment link as the date approaches.` : " The remaining balance will be invoiced separately."}</p>
      <p style="margin:0 0 8px;font-size:14px;">For your records:</p>
      <p style="margin:8px 0;"><a href="${escapeHtml(agreementUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View your signed agreement</a></p>
      ${invoiceUrl ? `<p style="margin:8px 0;"><a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View your ${fullyPaid ? "paid invoice" : "deposit receipt invoice"}</a></p>` : ""}
      ${balance?.viewToken ? `<p style="margin:8px 0;"><a href="${escapeHtml(`${appBase}/invoice/${balance.viewToken}`)}" style="display:inline-block;background:#475569;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View balance invoice ($${balance.amount.toFixed(2)}${balance.dueIso ? ` — due ${new Date(balance.dueIso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""})</a></p>` : ""}
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">Both pages can be printed or saved as PDF. Questions? Just reply to this email.</p>
      <p style="margin:24px 0 0;color:#64748b;font-size:13px;">— ${escapeHtml(orgName)}</p>
    </body></html>`,
  });
}


/**
 * When a deposit (not full payment) settles, raise the invoice for the
 * remaining balance immediately: status "sent", due 14 days before the
 * event (or 30 days out when no event date is known), payable through the
 * public invoice page's existing Stripe flow. The reminder cron nags on it
 * and the Stripe webhook completes the proposal when it's paid — the
 * client_info.proposalId marker is what ties those together.
 * Idempotent via that same marker. Never throws.
 */
async function ensureBalanceInvoice(
  proposal: { id: string; org_id: string; client_id: string; title: string; tax_rate: number; tax_amount: number; total: number; client_field_values?: Record<string, string> | null },
  org: { name?: string | null; business_info?: Record<string, unknown> | null },
  paidAmount: number,
): Promise<{ dueIso: string; amount: number; viewToken: string } | null> {
  try {
    const balance = Math.round((Number(proposal.total ?? 0) - paidAmount) * 100) / 100;
    if (balance <= 0) return null;

    const { data: existing } = await supabase
      .from("invoices").select("id, due_date, total, view_token")
      .eq("org_id", proposal.org_id)
      .eq("client_info->>proposalId", proposal.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) return { dueIso: existing.due_date || "", amount: Number(existing.total || balance), viewToken: existing.view_token || "" };

    const today = new Date().toISOString().slice(0, 10);
    const cfv = (proposal.client_field_values && typeof proposal.client_field_values === "object")
      ? proposal.client_field_values : {};
    const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
    const rowDates = Object.entries(cfv)
      .filter(([k]) => /^event_date_\d+$/.test(k))
      .map(([, v]) => iso(v)).filter(Boolean).sort();
    const serviceDate = rowDates[0] || iso(cfv.event_start_date) || iso(cfv.event_date) || "";
    const serviceEnd = rowDates[rowDates.length - 1] || iso(cfv.event_end_date) || serviceDate;
    // Due 14 days before the event, per the agreement's payment terms —
    // never in the past (a booking inside the window is due immediately).
    let dueIso: string;
    if (serviceDate) {
      const d = new Date(serviceDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 14);
      dueIso = d.toISOString().slice(0, 10);
      if (dueIso < today) dueIso = today;
    } else {
      const d = new Date(today + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 30);
      dueIso = d.toISOString().slice(0, 10);
    }

    const bi = (org.business_info && typeof org.business_info === "object" ? org.business_info : {}) as Record<string, string>;
    const companyInfo = {
      name: org.name || bi.name || "", email: bi.email || "", phone: bi.phone || "",
      address: bi.address || "", city: bi.city || "", state: bi.state || "", zip: bi.zip || "",
      website: bi.website || "",
    };
    const { data: client } = await supabase
      .from("clients").select("company, contact_name, email, phone").eq("id", proposal.client_id).maybeSingle();
    const cleanV = (v: unknown) => String(v || "").trim();
    const venueLine = (cleanV(cfv.event_location) || [
      cleanV(cfv.event_venue_name),
      cleanV(cfv.event_address),
      [cleanV(cfv.event_city_state), cleanV(cfv.event_zip)].filter(Boolean).join(" "),
    ].filter(Boolean).join(", ")).slice(0, 300);
    const clientInfo: Record<string, string> = {
      company: client?.company || "", contactName: client?.contact_name || "",
      email: client?.email || "", phone: client?.phone || "",
      proposalId: proposal.id,
      ...(cfv.po_number ? { poNumber: String(cfv.po_number).slice(0, 100) } : {}),
      ...(venueLine ? { eventLocation: venueLine } : {}),
    };

    // The deposit invoice charged no tax, so the full tax rides here.
    const taxAmount = Number(proposal.tax_amount ?? 0);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const invoiceId = Array.from(randomBytes(10)).map(b => alphabet[b % alphabet.length]).join("");
    const viewToken = randomBytes(8).toString("hex");
    const insErr = await insertInvoiceNumbered(proposal.org_id, {
      id: invoiceId,
      org_id: proposal.org_id,
      client_id: proposal.client_id,
      ...(serviceDate ? { period_start: serviceDate, period_end: serviceEnd } : {}),
      subtotal: Math.round((balance - taxAmount) * 100) / 100,
      tax_rate: Number(proposal.tax_rate ?? 0),
      tax_amount: taxAmount,
      total: balance,
      status: "sent",
      issue_date: today, due_date: dueIso,
      line_items: [{
        ...(serviceDate ? { date: serviceDate } : { date: dueIso }),
        ...(serviceEnd && serviceEnd !== serviceDate ? { dateEnd: serviceEnd } : {}),
        amount: balance, quantity: 1, unitPrice: balance,
        description: `Remaining balance — ${proposal.title || "Proposal"}`,
      }],
      company_info: companyInfo,
      client_info: clientInfo,
      notes: `Remaining balance per signed proposal: ${proposal.title || ""}. Deposit of $${paidAmount.toFixed(2)} received ${today}.`,
      payment_methods: ["stripe"],
      view_token: viewToken,
    });
    if (insErr) { console.warn(`[proposal-accept] balance invoice create failed: ${insErr}`); return null; }
    return { dueIso, amount: balance, viewToken };
  } catch (err) {
    console.warn(`[proposal-accept] balance invoice failed: ${errorMessage(err, "unknown")}`);
    return null;
  }
}

/** "8:30 AM" / "5 pm" / "08:30" → "HH:MM" 24h, or "" when unparseable. */
function parseTimeText(v: unknown): string {
  const m = String(v || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2] || "00";
  const ap = (m[3] || "").toLowerCase();
  if (h > 23 || parseInt(min, 10) > 59) return "";
  if (ap.startsWith("p") && h < 12) h += 12;
  if (ap.startsWith("a") && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/**
 * One tentative project per confirmed coverage day (event_date_N rows, or
 * the single event_date), so a signed proposal lands on the calendar with
 * its dates immediately. The full amount rides on day one (per_project);
 * later days carry 0 so nothing double-bills. Projects are tagged
 * [proposal:id] in notes; verify-payment flips them to upcoming + paid.
 * Idempotent via proposals.project_id. Crew starts empty — assignment is
 * the owner's call, per position, in the app.
 */
async function createProjectsForProposal(
  proposal: { id: string; org_id: string; client_id: string; title: string; total: number; project_id?: string | null },
  cfv: Record<string, string>,
  acceptedTotal: number,
) {
  if (proposal.project_id) return; // already created

  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const rows = Object.entries(cfv)
    .map(([k, v]) => { const m = k.match(/^event_date_(\d+)$/); return m ? { n: Number(m[1]), date: String(v || "") } : null; })
    .filter((r): r is { n: number; date: string } => !!r && isoRe.test(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const days = rows.length > 0
    ? rows.map(r => ({ date: r.date, start: parseTimeText(cfv[`event_start_time_${r.n}`]), end: parseTimeText(cfv[`event_end_time_${r.n}`]) }))
    : (isoRe.test(cfv.event_date || "") ? [{ date: cfv.event_date, start: parseTimeText(cfv.event_start_time), end: parseTimeText(cfv.event_end_time) }] : []);
  if (days.length === 0) return;

  // A project type is mandatory: prefer an event-ish one, else the org's
  // first, else create a plain "Event" type.
  const { data: types } = await supabase.from("project_types").select("id, name").eq("org_id", proposal.org_id);
  let typeId = (types || []).find(t => /event/i.test(t.name || ""))?.id || (types || [])[0]?.id || "";
  if (!typeId) {
    typeId = `pt_${nanoid(8)}`;
    await supabase.from("project_types").insert({ id: typeId, org_id: proposal.org_id, name: "Event" });
  }

  const venue = [cfv.event_venue_name, cfv.event_address, [cfv.event_city_state, cfv.event_zip].filter(Boolean).join(" ")]
    .map(x => String(x || "").trim()).filter(Boolean).join(", ");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const now = new Date().toISOString();
  let firstId = "";
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const projId = Array.from(randomBytes(10)).map(b => alphabet[b % alphabet.length]).join("");
    if (!firstId) firstId = projId;
    const { error } = await supabase.from("projects").insert({
      id: projId,
      org_id: proposal.org_id,
      client_id: proposal.client_id,
      project_type_id: typeId,
      date: d.date,
      start_time: d.start || "",
      end_time: d.end || "",
      status: "tentative",
      crew: [],
      billing_model: "per_project",
      project_rate: i === 0 ? Number(acceptedTotal || 0) : 0,
      notes: [
        `Booked via signed proposal: ${proposal.title || ""} [proposal:${proposal.id}]`,
        venue ? `Venue: ${venue}` : "",
        days.length > 1 ? `Day ${i + 1} of ${days.length}` : "",
      ].filter(Boolean).join("\n"),
    });
    if (error) throw new Error(error.message);
  }
  await supabase.from("proposals").update({ project_id: firstId, updated_at: now }).eq("id", proposal.id);
}

/**
 * Allocate the org's next INV-YYYY-NNNN number and insert the invoice row.
 * invoice_number is globally unique in the schema, so on a cross-org
 * collision we walk upward a few slots instead of failing.
 */
async function insertInvoiceNumbered(orgId: string, row: Record<string, unknown>): Promise<string | null> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const { data: latest } = await supabase
    .from("invoices").select("invoice_number").eq("org_id", orgId)
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false }).limit(1);
  const nextNum = (latest?.[0]?.invoice_number ? (parseInt(latest[0].invoice_number.slice(prefix.length), 10) || 0) : 0) + 1;
  let insErr: { message: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from("invoices").insert({
      ...row,
      invoice_number: `${prefix}${String(nextNum + attempt).padStart(4, "0")}`,
    });
    insErr = error;
    if (!error) return null;
    if (error.code !== "23505") break; // only retry unique collisions
  }
  return insErr ? insErr.message : null;
}

/**
 * Create (or fetch) the paid invoice for a proposal payment. Returns its
 * public view token, or null when creation fails — payment verification
 * must never fail because the receipt could not be written.
 */
async function ensurePaidInvoice(
  proposal: { id: string; org_id: string; client_id: string; title: string; line_items: unknown; subtotal: number; tax_rate: number; tax_amount: number; total: number; invoice_id: string | null; client_field_values?: Record<string, string> | null },
  org: { name?: string | null; business_info?: Record<string, unknown> | null },
  session: { amount_total?: number | null },
  fullyPaid: boolean,
): Promise<string | null> {
  try {
    if (proposal.invoice_id) {
      const { data: existing } = await supabase
        .from("invoices").select("view_token").eq("id", proposal.invoice_id).maybeSingle();
      return existing?.view_token || null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const paidAmount = Math.round(Number(session.amount_total ?? 0)) / 100;

    // Full payment carries the proposal's own line items onto the invoice;
    // a partial payment (deposit / milestone) gets one line for the amount
    // actually paid, so the invoice never claims more was billed than paid.
    const cfv = (proposal.client_field_values && typeof proposal.client_field_values === "object")
      ? proposal.client_field_values : {};
    // Service dates, best source first: ISO event_start_date/event_end_date
    // in the proposal's client field values (multi-day events set these), then
    // the linked pipeline lead's single event date, then today.
    const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
    const { data: lead } = await supabase
      .from("pipeline_leads").select("event_date").eq("proposal_id", proposal.id).is("deleted_at", null).maybeSingle();
    // Schedule rows (event_date_1..N) the client confirmed take priority;
    // owner-prefilled start/end and the lead's date remain fallbacks.
    const rowDates = Object.entries(cfv)
      .filter(([k]) => /^event_date_\d+$/.test(k))
      .map(([, v]) => iso(v))
      .filter(Boolean)
      .sort();
    const serviceDate = rowDates[0] || iso(cfv.event_start_date) || iso(lead?.event_date) || today;
    const serviceEnd = rowDates[rowDates.length - 1] || iso(cfv.event_end_date) || serviceDate;

    const srcItems: Record<string, unknown>[] = Array.isArray(proposal.line_items)
      ? (proposal.line_items as Record<string, unknown>[])
      : [];
    const lineItems = fullyPaid && srcItems.length > 0
      ? srcItems.map((li) => ({
          date: serviceDate,
          ...(serviceEnd !== serviceDate ? { dateEnd: serviceEnd } : {}),
          amount: Number(li.amount) || 0,
          quantity: Number(li.quantity) || 1,
          unitPrice: Number(li.unitPrice) || 0,
          description: String(li.description || proposal.title || "Services"),
        }))
      : [{ date: serviceDate, ...(serviceEnd !== serviceDate ? { dateEnd: serviceEnd } : {}), amount: paidAmount, quantity: 1, unitPrice: paidAmount, description: `Payment received — ${proposal.title || "Proposal"}` }];

    const bi = (org.business_info && typeof org.business_info === "object" ? org.business_info : {}) as Record<string, string>;
    const companyInfo = {
      name: org.name || bi.name || "", email: bi.email || "", phone: bi.phone || "",
      address: bi.address || "", city: bi.city || "", state: bi.state || "", zip: bi.zip || "",
      website: bi.website || "",
    };

    const { data: client } = await supabase
      .from("clients").select("company, contact_name, email, phone").eq("id", proposal.client_id).maybeSingle();
    const clientInfo = {
      company: client?.company || "", contactName: client?.contact_name || "",
      email: client?.email || "", phone: client?.phone || "",
      // AP teams pay against purchase orders; a po_number collected on the
      // proposal prints as the invoice's PO / Reference line.
      ...(cfv.po_number ? { poNumber: String(cfv.po_number).slice(0, 100) } : {}),
    };


    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const invoiceId = Array.from(randomBytes(10)).map(b => alphabet[b % alphabet.length]).join("");
    const viewToken = randomBytes(8).toString("hex");

    const taxCharged = fullyPaid ? Number(proposal.tax_amount ?? 0) : 0;
    const subtotal = Math.round((paidAmount - taxCharged) * 100) / 100;
    // One modest notes block: the proposal reference plus each line item's
    // details sentence. Line items stay as priced on the proposal (Geoff,
    // 2026-08-22: one investment figure, not split sub-prices).
    const detailText = srcItems
      .map(li => String(li.details || "").trim())
      .filter(Boolean)
      .join("\n\n");
    // The venue the client confirmed at signing: legacy single field, or
    // composed from the structured name/address/city-state/zip fields.
    // Rendered as its own labeled row on the invoice, not a notes line.
    const cleanV = (v: unknown) => String(v || "").trim();
    const venueLine = (cleanV(cfv.event_location) || [
      cleanV(cfv.event_venue_name),
      cleanV(cfv.event_address),
      [cleanV(cfv.event_city_state), cleanV(cfv.event_zip)].filter(Boolean).join(" "),
    ].filter(Boolean).join(", ")).slice(0, 300);

    const notes = [
      (fullyPaid
        ? `Paid in full via proposal acceptance: ${proposal.title || ""}`
        : `Deposit received via proposal acceptance: ${proposal.title || ""}. Remaining balance to be invoiced.`).trim(),
      detailText,
    ].filter(Boolean).join("\n\n");

    if (venueLine) (clientInfo as Record<string, string>).eventLocation = venueLine;
    // How this invoice was actually settled — the renderer's paid banner
    // reads THIS, not the offered-methods list, so it never misattributes.
    (clientInfo as Record<string, string>).paidVia = "card via Stripe";

    const insErr = await insertInvoiceNumbered(proposal.org_id, {
      id: invoiceId,
      org_id: proposal.org_id,
      client_id: proposal.client_id,
      period_start: serviceDate, period_end: serviceEnd,
      subtotal,
      tax_rate: fullyPaid ? Number(proposal.tax_rate ?? 0) : 0,
      tax_amount: taxCharged,
      total: paidAmount,
      status: "paid",
      issue_date: today, due_date: today, paid_date: today,
      line_items: lineItems,
      company_info: companyInfo,
      client_info: clientInfo,
      notes,
      payment_methods: ["stripe"],
      view_token: viewToken,
    });
    if (insErr) { console.warn(`[proposal-accept] invoice create failed: ${insErr}`); return null; }

    await supabase.from("proposals").update({ invoice_id: invoiceId, updated_at: new Date().toISOString() }).eq("id", proposal.id);
    return viewToken;
  } catch (err) {
    console.warn(`[proposal-accept] invoice create failed: ${errorMessage(err, "unknown")}`);
    return null;
  }
}

/** Email + in-app push: the client signed, go countersign. AWAIT this
 *  (Promise.allSettled) before responding — a fire-and-forget here dies with
 *  the invocation, which is how signed-proposal emails silently vanished on
 *  the pay-at-signing path (found 2026-08-22). */
async function notifySignedAllChannels(orgId: string, title: string, signerName: string) {
  const results = await Promise.allSettled([
    notifyOwner(orgId, title, signerName, "signed"),
    sendPushToOwner(orgId, {
      title: "Proposal signed — countersign",
      body: `${signerName || "Your client"} signed ${title || "a proposal"}. Open Slate to countersign.`,
      data: { type: "proposal" },
    }),
  ]);
  results.forEach((r, i) => {
    if (r.status === "rejected") console.warn(`[proposal-accept] ${i === 0 ? "email" : "push"} notify failed: ${errorMessage(r.reason, "unknown")}`);
  });
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

/** Coerce an unknown column value to a string for merge-field substitution. */
function asText(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

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
  /** What the client actually bought, so clauses tied to a service are kept
   *  or dropped in the signed copy the same way they were in the proposal. */
  chosenPackageIds: string[] = [],
  /** A second person named on the agreement who signed it at the same time. */
  extraSignerForContract: { name: string; email: string; signatureData: string; signatureType: string; timestamp: string } | null = null,
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
  // `proposal` is a bag of unknowns, so these need coercing before they can
  // stand in as strings in the merge-field input below.
  let clientEmail = asText(proposal.client_email);
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
  // Both branches get the same defaults. The block branch used to pass its
  // partials straight through, so a payment_schedule block missing a label or
  // due type would put "undefined" into the generated contract.
  const withDefaults = (m: PartialMilestone) => ({
    label: m.label || "",
    type: m.type || ("fixed" as const),
    percent: m.percent,
    fixedAmount: m.fixedAmount,
    amount: m.amount,
    dueType: m.dueType || ("at_signing" as const),
    dueDays: m.dueDays,
    dueDate: m.dueDate,
  });
  const finalMilestones = blockMilestones.length > 0
    ? blockMilestones.map(withDefaults)
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

  // Shared input for the merge-field generator.
  const generatorInput = {
    proposalTitle: asText(proposal.title),
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
  };

  // Single-page legacy: substitute the flat `content` HTML.
  const renderedHtml = generateContractContent({
    ...generatorInput,
    masterTemplateHtml: tpl.content || "",
  });

  // Multi-page: if the template has pages, walk each one and substitute
  // tokens against its pre-rendered content. Invoice pages copy as-is —
  // they auto-render from contract.payment_milestones at view time, no
  // text content to substitute. Each substituted page goes onto the
  // contract row so the client sees the full document with real values.
  const tplPages: Array<{ id: string; type: string; label: string; content?: string; blocks?: unknown[]; sortOrder: number }> = Array.isArray(tpl.pages) ? tpl.pages : [];
  // Drop clauses whose services weren't bought, before the page is flattened
  // to HTML. A conditional clause the client never saw must not appear in the
  // document they signed — that's the difference between a tailored contract
  // and a wrong one.
  const applies = (b: unknown) => {
    const need = (b as { showWhenPackageIds?: string[] })?.showWhenPackageIds;
    if (!need || need.length === 0) return true;
    return need.some(id => chosenPackageIds.includes(id));
  };

  const contractPages = tplPages.map(p => {
    if (p.type === "invoice") {
      // Drop blocks too — the invoice page renders without them.
      return { ...p, blocks: [], content: "" };
    }
    const substituted = generateContractContent({
      ...generatorInput,
      masterTemplateHtml: p.content || "",
    });
    // Blocks are kept, filtered, rather than emptied: the flattened HTML is
    // what renders today, but throwing the structure away means a
    // block-based contract template silently loses its conditions.
    return { ...p, blocks: (p.blocks || []).filter(applies), content: substituted };
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
    // Already signed at acceptance, so no separate signing link is issued —
    // they signed the same document at the same moment as the first party.
    additional_signers: extraSignerForContract ? [extraSignerForContract] : [],
    payment_milestones: stampedMilestones,
    pages: contractPages,
    document_expires_at: null,
    reminders_enabled: false,
    firing_log: [],
    send_back_reason: "",
    updated_at: now,
  });
  if (insErr) throw new Error(insErr.message);
  return id;
}

