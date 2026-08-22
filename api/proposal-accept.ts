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
      if (typeof v === "string" && /^[a-z_]{1,40}$/.test(k)) clean[k] = v.slice(0, 500);
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
    .select("id, org_id, client_id, title, line_items, subtotal, tax_rate, tax_amount, total, invoice_id, client_field_values")
    .eq("view_token", token as string)
    .single();

  if (!proposal) return res.status(404).json({ error: "Proposal not found" });

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
    const now = new Date().toISOString();
    await supabase.from("proposals").update({
      paid_at: now,
      updated_at: now,
    }).eq("id", proposal.id);

    // A paid invoice the client can open (and print/save as PDF) right from
    // the confirmation screen. Created once: page reloads re-enter this
    // handler, so an already-linked invoice is returned, not duplicated.
    const invoiceToken = await ensurePaidInvoice(proposal, org, session);
    return res.status(200).json({ paid: true, ...(invoiceToken ? { invoiceToken } : {}) });
  }

  return res.status(200).json({ paid: false });
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
): Promise<string | null> {
  try {
    if (proposal.invoice_id) {
      const { data: existing } = await supabase
        .from("invoices").select("view_token").eq("id", proposal.invoice_id).maybeSingle();
      return existing?.view_token || null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const paidAmount = Math.round(Number(session.amount_total ?? 0)) / 100;
    const proposalTotal = Number(proposal.total ?? 0);

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
    const serviceDate = iso(cfv.event_start_date) || iso(lead?.event_date) || today;
    const serviceEnd = iso(cfv.event_end_date) || serviceDate;

    const fullyPaid = paidAmount > 0 && Math.abs(paidAmount - proposalTotal) < 0.01;
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


    // Same numbering scheme as the app: INV-YYYY-NNNN from the year's max.
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data: latest } = await supabase
      .from("invoices").select("invoice_number").like("invoice_number", `${prefix}%`)
      .order("invoice_number", { ascending: false }).limit(1);
    const maxNum = latest?.[0]?.invoice_number ? (parseInt(latest[0].invoice_number.slice(prefix.length), 10) || 0) : 0;
    const invoiceNumber = `${prefix}${String(maxNum + 1).padStart(4, "0")}`;

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const invoiceId = Array.from(randomBytes(10)).map(b => alphabet[b % alphabet.length]).join("");
    const viewToken = randomBytes(8).toString("hex");

    const subtotal = fullyPaid ? Number(proposal.subtotal ?? paidAmount) : paidAmount;
    // One modest notes block: the proposal reference plus each line item's
    // details sentence. Line items stay as priced on the proposal (Geoff,
    // 2026-08-22: one investment figure, not split sub-prices).
    const detailText = srcItems
      .map(li => String(li.details || "").trim())
      .filter(Boolean)
      .join("\n\n");
    const notes = [
      `Paid in full via proposal acceptance: ${proposal.title || ""}`.trim(),
      // The venue the client confirmed at signing (event_location field).
      cfv.event_location ? `Event location: ${String(cfv.event_location).slice(0, 300)}` : "",
      detailText,
    ].filter(Boolean).join("\n\n");

    const { error: insErr } = await supabase.from("invoices").insert({
      id: invoiceId,
      org_id: proposal.org_id,
      invoice_number: invoiceNumber,
      client_id: proposal.client_id,
      period_start: serviceDate, period_end: serviceEnd,
      subtotal,
      tax_rate: fullyPaid ? Number(proposal.tax_rate ?? 0) : 0,
      tax_amount: fullyPaid ? Number(proposal.tax_amount ?? 0) : 0,
      total: paidAmount || proposalTotal,
      status: "paid",
      issue_date: today, due_date: today, paid_date: today,
      line_items: lineItems,
      company_info: companyInfo,
      client_info: clientInfo,
      notes,
      payment_methods: ["stripe"],
      view_token: viewToken,
    });
    if (insErr) { console.warn(`[proposal-accept] invoice create failed: ${insErr.message}`); return null; }

    await supabase.from("proposals").update({ invoice_id: invoiceId, updated_at: new Date().toISOString() }).eq("id", proposal.id);
    return viewToken;
  } catch (err) {
    console.warn(`[proposal-accept] invoice create failed: ${errorMessage(err, "unknown")}`);
    return null;
  }
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

