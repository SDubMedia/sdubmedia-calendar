// ============================================================
// Contract Signing API — Public endpoint for client signatures
// No auth required — uses sign_token for verification
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { escapeHtml, errorMessage, isAllowedUrl } from "./_auth.js";

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
      case "get": return await getContract(token as string, res);
      case "sign": return await signContract(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }
}

// Look up a contract by token. Tries the primary `sign_token` first, then
// searches `additional_signers` JSONB for an entry with a matching token.
// Returns the contract row plus a `signer` descriptor identifying which
// signer this token represents.
type SignerInfo =
  | { type: "client"; id: null; name: string; email: string; signedAt: string | null }
  | { type: "additional"; id: string; name: string; email: string; role: string; signedAt: string | null };

async function findContractByToken(token: string): Promise<{ contract: Record<string, unknown>; signer: SignerInfo } | null> {
  if (!token) return null;
  // Try primary signer first.
  const primary = await supabase
    .from("contracts")
    .select("id, title, content, status, client_email, client_signed_at, owner_signed_at, additional_signers")
    .eq("sign_token", token)
    .maybeSingle();
  if (primary.data) {
    return {
      contract: primary.data as unknown as Record<string, unknown>,
      signer: {
        type: "client",
        id: null,
        name: "",
        email: (primary.data as Record<string, unknown>).client_email as string || "",
        signedAt: (primary.data as Record<string, unknown>).client_signed_at as string | null,
      },
    };
  }
  // Fall back: scan additional_signers JSONB. We use a containment query
  // on the array shape `[{ "signToken": token }]` so PostgREST can index it.
  const additional = await supabase
    .from("contracts")
    .select("id, title, content, status, client_email, client_signed_at, owner_signed_at, additional_signers")
    .filter("additional_signers", "cs", JSON.stringify([{ signToken: token }]))
    .maybeSingle();
  if (!additional.data) return null;
  const signers = (additional.data as Record<string, unknown>).additional_signers as Array<Record<string, unknown>> | null;
  const match = (signers || []).find(s => s.signToken === token);
  if (!match) return null;
  return {
    contract: additional.data as unknown as Record<string, unknown>,
    signer: {
      type: "additional",
      id: match.id as string,
      name: (match.name as string) || "",
      email: (match.email as string) || "",
      role: (match.role as string) || "Co-signer",
      signedAt: (match.signedAt as string | null) || null,
    },
  };
}

async function getContract(token: string, res: VercelResponse) {
  if (!token) return res.status(400).json({ error: "Missing token" });

  const found = await findContractByToken(token);
  if (!found) return res.status(404).json({ error: "Contract not found" });
  const { contract, signer } = found;

  if (contract.status === "void") return res.status(400).json({ error: "This contract has been voided" });
  if (signer.signedAt) {
    // Already-signed → return portal-style data: org branding, payment
    // milestones with paidAt status, linked project date + location.
    // Lets the client treat the same /sign/<token> URL as their bookmarkable
    // dashboard for this engagement.
    const portalData = await loadPortalData(contract);
    return res.status(200).json({ ...contract, alreadySigned: true, signer, ...portalData });
  }

  // Get org branding + owner identity for the letterhead. Look up by
  // contract id (token may belong to an additional signer, not the primary).
  const { data: org } = await supabase.from("contracts").select("org_id").eq("id", contract.id as string).single();
  let orgName = "";
  let orgLogo = "";
  let orgBusinessInfo: Record<string, unknown> | null = null;
  let ownerName = "";
  if (org?.org_id) {
    const [{ data: orgData }, { data: ownerProfiles }] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, logo_url, business_info")
        .eq("id", org.org_id)
        .single(),
      supabase
        .from("user_profiles")
        .select("name")
        .eq("org_id", org.org_id)
        .eq("role", "owner")
        .limit(1),
    ]);
    orgName = orgData?.name || "";
    orgLogo = orgData?.logo_url || "";
    orgBusinessInfo = (orgData?.business_info as Record<string, unknown>) || null;
    ownerName = (ownerProfiles?.[0]?.name as string) || "";
  }

  return res.status(200).json({ ...contract, orgName, orgLogo, orgBusinessInfo, ownerName, signer, alreadySigned: false });
}

/**
 * Build the payload for the post-signing portal view: org branding, project
 * info, payment milestones. Same /sign/<token> URL becomes bookmarkable.
 */
async function loadPortalData(contract: Record<string, unknown>): Promise<{
  orgName: string;
  orgLogo: string;
  projectDate: string | null;
  projectLocation: string | null;
}> {
  let orgName = "";
  let orgLogo = "";
  let projectDate: string | null = null;
  let projectLocation: string | null = null;

  if (contract.org_id) {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", contract.org_id as string)
      .single();
    orgName = orgData?.name || "";
    orgLogo = orgData?.logo_url || "";
  }

  // Resolve project info via the linked proposal (preferred) or directly.
  let projectId: string | null = null;
  if (contract.proposal_id) {
    const { data: prop } = await supabase
      .from("proposals")
      .select("project_id")
      .eq("id", contract.proposal_id as string)
      .single();
    projectId = prop?.project_id || null;
  }
  if (!projectId && contract.project_id) projectId = contract.project_id as string;

  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("date, location_id")
      .eq("id", projectId)
      .single();
    if (project) {
      projectDate = project.date || null;
      if (project.location_id) {
        const { data: loc } = await supabase
          .from("locations")
          .select("name")
          .eq("id", project.location_id)
          .single();
        projectLocation = loc?.name || null;
      }
    }
  }

  return { orgName, orgLogo, projectDate, projectLocation };
}

async function signContract(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { token, signature } = req.body;
  if (!token || !signature) return res.status(400).json({ error: "Missing token or signature" });

  const found = await findContractByToken(token);
  if (!found) return res.status(404).json({ error: "Contract not found" });
  const { contract, signer } = found;

  if (contract.status === "void") return res.status(400).json({ error: "Contract is voided" });
  if (signer.signedAt) return res.status(400).json({ error: "Already signed" });

  // Primary client may only sign once status === "sent". Additional signers
  // can sign any time after the contract has been sent (sent / client_signed).
  if (signer.type === "client" && contract.status !== "sent") {
    return res.status(400).json({ error: "Contract is not available for signing" });
  }
  if (signer.type === "additional" && contract.status === "draft") {
    return res.status(400).json({ error: "Contract has not been sent yet" });
  }

  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  const fullSignature = {
    ...signature,
    ip: Array.isArray(ip) ? ip[0] : ip,
    timestamp: new Date().toISOString(),
  };
  const now = new Date().toISOString();

  if (signer.type === "client") {
    const { error } = await supabase.from("contracts").update({
      client_signature: fullSignature,
      client_signed_at: now,
      status: "client_signed",
      updated_at: now,
    }).eq("id", contract.id as string);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    // Update the matching entry in additional_signers JSONB.
    const signers = (contract.additional_signers as Array<Record<string, unknown>>) || [];
    const updated = signers.map(s => s.id === signer.id
      ? { ...s, signature: fullSignature, signedAt: now }
      : s,
    );
    const { error } = await supabase.from("contracts").update({
      additional_signers: updated,
      updated_at: now,
    }).eq("id", contract.id as string);
    if (error) return res.status(500).json({ error: error.message });
  }

  // Notify owner.
  const { data: fullContract } = await supabase.from("contracts").select("org_id, title, proposal_id").eq("id", contract.id as string).single();
  if (fullContract?.org_id) {
    const { data: profiles } = await supabase.from("user_profiles").select("email").eq("org_id", fullContract.org_id).eq("role", "owner");
    const ownerEmail = profiles?.[0]?.email;
    if (ownerEmail) {
      const signerLabel = signer.type === "client" ? "client" : `${signer.role.toLowerCase()} (${signer.name})`;
      resend.emails.send({
        from: FROM_EMAIL, to: ownerEmail,
        subject: `Contract Signed: ${fullContract.title}`,
        html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;"><h2 style="color:#0088ff;">Contract signed</h2><p style="color:#1e293b;"><strong>${escapeHtml(signature.name || "")}</strong> just signed as ${escapeHtml(signerLabel)} on <strong>${escapeHtml(fullContract.title || "")}</strong>.</p><p style="color:#64748b;">Log in to Slate to review.</p></div>`,
      }).catch(() => {});
    }
  }

  // ---------- Phase A: deposit at signing ----------
  // If this contract was auto-generated from a proposal AND the client just
  // signed (not an additional signer), kick off Stripe Checkout for the
  // at-signing milestone. Failure here doesn't block the signature — the
  // owner can re-issue a payment link from the contract record later.
  if (signer.type === "client" && fullContract?.proposal_id) {
    try {
      const checkoutUrl = await createDepositCheckoutForContract(
        contract.id as string,
        fullContract.proposal_id as string,
        fullContract.org_id as string,
        req,
      );
      if (checkoutUrl) {
        return res.status(200).json({ success: true, paymentRequired: true, checkoutUrl });
      }
    } catch (err) {
      // Sign succeeded; surface payment-failure as a soft warning.
      return res.status(200).json({ success: true, paymentRequired: true, paymentError: errorMessage(err) });
    }
  }

  return res.status(200).json({ success: true });
}

// ---- Deposit-at-signing helper ----

async function createDepositCheckoutForContract(
  contractId: string,
  proposalId: string,
  orgId: string,
  req: VercelRequest,
): Promise<string | null> {
  // Pull proposal data — milestones + total.
  const { data: proposal } = await supabase
    .from("proposals")
    .select("title, payment_milestones, total, payment_config, client_email")
    .eq("id", proposalId)
    .single();
  if (!proposal) return null;

  type Milestone = {
    label?: string;
    type?: "percent" | "fixed";
    percent?: number;
    fixedAmount?: number;
    amount?: number;
    dueType?: "at_signing" | "relative_days" | "absolute_date";
  };
  const milestones: Milestone[] = (proposal.payment_milestones as Milestone[]) || [];
  const atSigning = milestones.find(m => m.dueType === "at_signing");
  const total = Number(proposal.total ?? 0);

  let amount = 0;
  let label = "Deposit";
  if (atSigning) {
    amount = atSigning.type === "percent"
      ? Math.round(total * (atSigning.percent || 0) / 100 * 100) / 100
      : Number(atSigning.fixedAmount ?? atSigning.amount ?? 0);
    label = atSigning.label || (atSigning.type === "percent" ? `${atSigning.percent}% deposit` : "Deposit");
  } else {
    // Legacy fallback: payment_config.option = "deposit" or "full".
    const pc = (proposal.payment_config as { option?: string; depositPercent?: number }) || {};
    if (pc.option === "deposit") {
      amount = Math.round(total * ((pc.depositPercent || 0) / 100) * 100) / 100;
      label = `${pc.depositPercent}% Deposit`;
    } else if (pc.option === "full") {
      amount = total;
      label = "Full Payment";
    }
  }
  if (amount <= 0) return null; // Nothing to charge

  // Org's connected Stripe account.
  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_account_id, name")
    .eq("id", orgId)
    .single();
  if (!org?.stripe_account_id) {
    throw new Error("Payment processing not set up. Contact the sender.");
  }

  // Validate origin to prevent open redirect.
  const allowedHost = process.env.VERCEL_URL || process.env.VITE_APP_URL || "";
  const rawOrigin = (req.headers.origin as string) || (req.headers.referer as string)?.replace(/\/[^/]*$/, "") || "";
  const origin = (rawOrigin && (rawOrigin.includes("sdubmedia") || rawOrigin.includes("localhost") || rawOrigin.includes("vercel.app")))
    ? rawOrigin
    : `https://${allowedHost}`;

  const successUrl = `${origin}/sign/${contractId}?paid=true&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/sign/${contractId}?paid=false`;
  if (!isAllowedUrl(successUrl) || !isAllowedUrl(cancelUrl)) {
    throw new Error("Invalid redirect URL");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: proposal.title || "Contract Deposit",
          description: `${label} — ${org.name || ""}`,
        },
        unit_amount: Math.round(amount * 100),
      },
      quantity: 1,
    }],
    metadata: {
      contractId,
      proposalId,
      orgId,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  }, { stripeAccount: org.stripe_account_id });

  return session.url ?? null;
}
