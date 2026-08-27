// ============================================================
// "I never got the email." Correct the address if it's wrong, and send again.
//
// Which email to send is NOT a choice the owner should have to make — it
// depends on where the booking actually is, and getting it wrong is worse than
// sending nothing. So this reads the state and picks:
//
//   • date announced, still no time chosen  → "pick your time" (the deadline
//     email — the one people actually chase, because missing it costs them)
//   • anything else                         → their confirmation / place-held
//
// Both come from the same builders the original sends use, so a resend can
// never drift into being a subtly different email from the one they're
// comparing it against.
//
// Correcting the address is the same request on purpose: a typo'd email is by
// far the most common reason for "it never arrived", and fixing it without
// resending just leaves them still waiting.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { brandedEmailWrapper } from "./_emailBranding.js";
import { orgSender, buildMiniBookingEmail, buildMiniClaimEmail } from "./_miniBooking.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const callerOrgId = await getUserOrgId(user.userId);
  if (!callerOrgId) return res.status(403).json({ error: "No organization" });

  const { data: callerProfile } = await supabase
    .from("user_profiles").select("role").eq("id", user.userId).single();
  const role = callerProfile?.role;
  if (role !== "owner" && role !== "partner" && role !== "staff") {
    return res.status(403).json({ error: "Not allowed" });
  }

  const bookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId.trim().slice(0, 40) : "";
  const newEmail = typeof req.body?.email === "string" ? req.body.email.trim().slice(0, 200) : "";
  if (!bookingId) return res.status(400).json({ error: "Missing booking" });
  if (newEmail && !EMAIL_RE.test(newEmail)) return res.status(400).json({ error: "That email doesn't look right" });

  try {
    const { data: b } = await supabase
      .from("mini_session_bookings").select("*").eq("id", bookingId).maybeSingle();
    if (!b) return res.status(404).json({ error: "Booking not found" });
    if (b.org_id !== callerOrgId) return res.status(403).json({ error: "Not your booking" });

    const email = newEmail || b.email;
    if (!email) {
      return res.status(400).json({ error: "No email on this booking — add one to send it." });
    }
    if (newEmail && newEmail !== b.email) {
      const { error: upErr } = await supabase
        .from("mini_session_bookings")
        .update({ email: newEmail, updated_at: new Date().toISOString() })
        .eq("id", bookingId);
      // Sending to an address we failed to save means the next email goes to the
      // old one again and they're back where they started. Stop instead.
      if (upErr) return res.status(500).json({ error: `Couldn't save the new address: ${upErr.message}` });
      b.email = newEmail;
    }

    const { data: ev } = await supabase
      .from("mini_sessions").select("*").eq("id", b.mini_session_id).maybeSingle();
    if (!ev) return res.status(404).json({ error: "Session not found" });

    const { from, replyTo, orgName, businessInfo } = await orgSender(b.org_id);
    const paid = Math.round(Number(b.deposit_paid_cents || 0));
    const balance = Math.max(0, Math.round(Number(b.total_cents || 0)) - paid);

    // Still owed a time, and the clock is running → that's the email they want.
    const awaitingClaim = !b.slot_time && !!ev.booking_opened_at;
    let mail: { subject: string; body: string } | null;
    let kind: string;

    if (awaitingClaim) {
      const deadlineText = ev.booking_deadline
        ? new Date(ev.booking_deadline).toLocaleString("en-US", {
            weekday: "long", month: "long", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZoneName: "short",
            timeZone: process.env.BUSINESS_TZ || "America/Chicago",
          })
        : "the deadline";
      mail = buildMiniClaimEmail(b, ev, deadlineText, orgName);
      kind = "Pick your time";
    } else {
      mail = buildMiniBookingEmail(b, ev, paid, balance);
      kind = b.slot_time ? "Booking confirmation" : "Place held";
    }
    if (!mail) return res.status(500).json({ error: "Couldn't build that email" });

    await resend.emails.send({
      from, replyTo, to: email,
      subject: mail.subject,
      html: brandedEmailWrapper({ orgName, businessInfo: businessInfo as never }, mail.body),
    });

    return res.status(200).json({ ok: true, sentTo: email, kind });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't send that email") });
  }
}
