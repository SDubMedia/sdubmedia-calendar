// ============================================================
// Crew payout onboarding — create / continue a crew member's Stripe Express
// account so they can receive ACH direct deposits. Owner can onboard anyone in
// their org; staff can onboard only themselves. Returns a Stripe-hosted
// onboarding URL.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, isAllowedUrl, errorMessage } from "./_auth.js";

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
    const { crewMemberId, returnUrl } = req.body || {};
    if (!crewMemberId) return res.status(400).json({ error: "Missing crewMemberId" });

    const { data: profile } = await supabase
      .from("user_profiles").select("org_id, role, crew_member_id").eq("id", user.userId).single();
    if (!profile?.org_id) return res.status(401).json({ error: "Unauthorized" });

    const { data: crew } = await supabase
      .from("crew_members").select("*").eq("id", crewMemberId).single();
    if (!crew || crew.org_id !== profile.org_id) return res.status(404).json({ error: "Crew member not found" });

    // Owner onboards anyone in their org; staff onboard only themselves.
    if (profile.role !== "owner" && profile.crew_member_id !== crewMemberId) {
      return res.status(403).json({ error: "Not allowed" });
    }

    let accountId: string | null = crew.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: crew.email || undefined,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { crewMemberId, orgId: profile.org_id },
      });
      accountId = account.id;
      const { error: upErr } = await supabase
        .from("crew_members").update({ stripe_account_id: accountId }).eq("id", crewMemberId);
      if (upErr) return res.status(500).json({ error: `Failed to save account: ${upErr.message}` });
    }

    const fallback = `${req.headers.origin || "https://slate.sdubmedia.com"}/staff-payments`;
    const base = (returnUrl && isAllowedUrl(returnUrl)) ? returnUrl : fallback;
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: base,
      return_url: base,
      type: "account_onboarding",
    });

    return res.status(200).json({ url: link.url, accountId });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to start payout setup") });
  }
}
