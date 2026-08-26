// ============================================================
// Charge one mini-session booking's outstanding balance, right now.
//
// The overnight cron already does this the day before the shoot. This is the
// same thing on demand, for the moment the owner is standing in front of the
// family and sees money still due — a card that declined overnight, or a
// booking taken by phone that never paid.
//
// Reuses chargeMiniBalance so the retry-across-saved-cards behaviour, the
// paid/declined bookkeeping and the metadata kind are identical to the cron.
// Two implementations of "take the rest of the money" would be one too many.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { chargeMiniBalance } from "./_miniBooking.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const callerOrgId = await getUserOrgId(user.userId);
  if (!callerOrgId) return res.status(403).json({ error: "No organization" });

  // Org membership alone isn't enough: a client/agent login has an org_id too,
  // and this route moves money on the org's connected account. Same role gate
  // as mini-deliver and mini-manual-book.
  const { data: callerProfile } = await supabase
    .from("user_profiles").select("role").eq("id", user.userId).single();
  const role = callerProfile?.role;
  if (role !== "owner" && role !== "partner" && role !== "staff") {
    return res.status(403).json({ error: "Not allowed" });
  }

  const bookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId.slice(0, 40) : "";
  if (!bookingId) return res.status(400).json({ error: "Missing booking" });

  try {
    const { data: b } = await supabase
      .from("mini_session_bookings").select("*").eq("id", bookingId).maybeSingle();
    if (!b) return res.status(404).json({ error: "Booking not found" });
    if (b.org_id !== callerOrgId) return res.status(403).json({ error: "Not your booking" });
    if (b.status === "cancelled") return res.status(400).json({ error: "This booking was cancelled" });

    const owed = Math.max(0, Number(b.total_cents || 0) - Number(b.deposit_paid_cents || 0));
    if (owed <= 0) return res.status(400).json({ error: "Nothing left to charge" });

    // No saved card is not a failure — it's the normal state of a booking the
    // owner added by phone. Say so plainly so the UI can offer the pay link
    // instead of showing a decline that never happened.
    if (!b.stripe_customer_id) {
      return res.status(200).json({ ok: false, noCard: true, owed, error: "No card on file for this booking" });
    }

    const { data: org } = await supabase
      .from("organizations").select("stripe_account_id").eq("id", b.org_id).maybeSingle();
    if (!org?.stripe_account_id) return res.status(400).json({ error: "Stripe isn't connected" });

    const declineReason = await chargeMiniBalance(stripe, b, org.stripe_account_id);
    if (declineReason) {
      return res.status(200).json({ ok: false, declined: true, owed, error: declineReason });
    }
    return res.status(200).json({ ok: true, charged: owed });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't charge the card") });
  }
}
