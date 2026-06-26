// ============================================================
// Crew payout — send a real ACH payment to a crew member (owner only).
// Transfers from the SDub platform balance to the crew member's Stripe Express
// account, which Stripe then auto-pays out to their bank. Records a crew_payment
// (method "stripe", reference = transfer id). Idempotency-keyed so a double-click
// can't double-pay.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { verifyAuth, errorMessage } from "./_auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

// Sanity ceiling so a fat-fingered amount can't drain the balance.
const MAX_PAYOUT_CENTS = 50000 * 100;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { crewMemberId, amount, projectId, role, note, idempotencyKey } = req.body || {};
    if (!crewMemberId) return res.status(400).json({ error: "Missing crewMemberId" });

    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return res.status(400).json({ error: "Invalid amount" });
    if (cents > MAX_PAYOUT_CENTS) return res.status(400).json({ error: "Amount exceeds the per-payout limit" });

    // Owner only.
    const { data: profile } = await supabase
      .from("user_profiles").select("org_id, role").eq("id", user.userId).single();
    if (!profile?.org_id) return res.status(401).json({ error: "Unauthorized" });
    if (profile.role !== "owner") return res.status(403).json({ error: "Only the owner can send payouts" });

    const { data: crew } = await supabase
      .from("crew_members").select("*").eq("id", crewMemberId).single();
    if (!crew || crew.org_id !== profile.org_id) return res.status(404).json({ error: "Crew member not found" });
    if (!crew.stripe_account_id || !crew.stripe_payouts_enabled) {
      return res.status(400).json({ error: "This person hasn't finished payout setup yet." });
    }

    // Make sure the platform balance can cover it.
    const balance = await stripe.balance.retrieve();
    const availableUsd = (balance.available || [])
      .filter(b => b.currency === "usd")
      .reduce((s, b) => s + b.amount, 0);
    if (availableUsd < cents) {
      return res.status(400).json({
        error: "Your Slate payout balance is too low. Top it up in Stripe, then try again.",
      });
    }

    const transfer = await stripe.transfers.create(
      {
        amount: cents,
        currency: "usd",
        destination: crew.stripe_account_id,
        metadata: { crewMemberId, orgId: profile.org_id, projectId: projectId || "" },
      },
      { idempotencyKey: idempotencyKey || `payout_${crewMemberId}_${projectId || "none"}_${cents}_${randomUUID()}` },
    );

    // Log it as a crew payment (method stripe, reference = transfer id).
    const { data: payment, error: insErr } = await supabase.from("crew_payments").insert({
      id: randomUUID(),
      org_id: profile.org_id,
      crew_member_id: crewMemberId,
      project_id: projectId || "",
      role: role || null,
      amount: cents / 100,
      payment_method: "stripe",
      paid_at: new Date().toISOString(),
      reference: transfer.id,
      note: note || null,
    }).select().single();
    if (insErr) {
      // The money moved; surface the logging failure so the owner can record it.
      return res.status(200).json({ ok: true, transferId: transfer.id, warning: `Paid, but couldn't log it: ${insErr.message}` });
    }

    return res.status(200).json({ ok: true, transferId: transfer.id, payment });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Payout failed") });
  }
}
