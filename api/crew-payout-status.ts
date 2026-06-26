// ============================================================
// Crew payout status — check whether a crew member has finished Stripe
// onboarding and can receive payouts. Refreshes the cached
// stripe_payouts_enabled flag. Owner can check anyone in their org; staff only
// themselves. (The account.updated webhook keeps the flag fresh too; this gives
// instant feedback right after onboarding.)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, errorMessage } from "./_auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { crewMemberId } = req.body || {};
    if (!crewMemberId) return res.status(400).json({ error: "Missing crewMemberId" });

    const { data: profile } = await supabase
      .from("user_profiles").select("org_id, role, crew_member_id").eq("id", user.userId).single();
    if (!profile?.org_id) return res.status(401).json({ error: "Unauthorized" });

    const { data: crew } = await supabase
      .from("crew_members").select("id, org_id, stripe_account_id").eq("id", crewMemberId).single();
    if (!crew || crew.org_id !== profile.org_id) return res.status(404).json({ error: "Crew member not found" });

    if (profile.role !== "owner" && profile.crew_member_id !== crewMemberId) {
      return res.status(403).json({ error: "Not allowed" });
    }

    if (!crew.stripe_account_id) {
      return res.status(200).json({ enabled: false, onboarded: false });
    }

    const account = await stripe.accounts.retrieve(crew.stripe_account_id);
    const enabled = !!account.payouts_enabled && account.capabilities?.transfers === "active";
    await supabase.from("crew_members").update({ stripe_payouts_enabled: enabled }).eq("id", crewMemberId);

    return res.status(200).json({
      enabled,
      onboarded: !!account.details_submitted,
      payoutsEnabled: !!account.payouts_enabled,
    });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to check payout status") });
  }
}
