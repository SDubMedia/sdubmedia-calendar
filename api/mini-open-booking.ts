// ============================================================
// Announce the date on a pre-sale mini session and invite everyone to claim a
// time — all at the same moment.
//
// Simultaneous is the point. These people paid a nonrefundable deposit for a
// place in a first-come scramble, so anyone emailed even a few minutes early
// gets a real advantage. One pass, one timestamp, everybody together.
//
// Idempotent by booking_opened_at: a second call is refused rather than
// re-emailing (and re-starting the clock for) people who already have their
// link. Getting this wrong means the fair race runs twice.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { brandedEmailWrapper } from "./_emailBranding.js";
import { orgSender, buildMiniClaimEmail } from "./_miniBooking.js";
import { generateSlots } from "./_miniSlots.js";
import { composeAddress } from "./_address.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);

const clean = (v: unknown, max = 40) => (typeof v === "string" ? v.trim().slice(0, max) : "");

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

  const miniSessionId = clean(req.body?.miniSessionId);
  const date = clean(req.body?.date, 10);
  const startTime = clean(req.body?.startTime, 5);
  const endTime = clean(req.body?.endTime, 5);
  const hours = Math.min(336, Math.max(1, Math.round(Number(req.body?.hours) || 72)));
  // Structured parts, never a free-text blob — see lib/address.ts. The one-line
  // form is composed here so every downstream reader (emails, sign-up page,
  // reminders) keeps getting the single field it already understands.
  const loc = (req.body?.location || {}) as Record<string, unknown>;
  const location = {
    locationName: clean(loc.locationName, 80),
    address: clean(loc.address, 120),
    city: clean(loc.city, 60),
    state: clean(loc.state, 2),
    zip: clean(loc.zip, 10),
  };
  const locationText = composeAddress(location);

  if (!miniSessionId) return res.status(400).json({ error: "Missing session" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Pick the date" });
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return res.status(400).json({ error: "Set the start and end time" });
  }

  try {
    const { data: ev } = await supabase.from("mini_sessions").select("*").eq("id", miniSessionId).maybeSingle();
    if (!ev) return res.status(404).json({ error: "Session not found" });
    if (ev.org_id !== callerOrgId) return res.status(403).json({ error: "Not your session" });
    if (ev.booking_opened_at) {
      return res.status(400).json({ error: "Booking is already open — everyone has had their link." });
    }

    const { data: holders } = await supabase
      .from("mini_session_bookings").select("*")
      .eq("mini_session_id", ev.id).eq("status", "waitlist")
      .in("payment_status", ["paid", "deposit_paid"]);
    const people = holders || [];

    // Refuse to announce a day that can't seat the people who already paid.
    // They bought a place on the promise of a time; discovering there isn't one
    // is the failure this whole cap exists to prevent.
    const slots = generateSlots({
      startTime, endTime,
      slotMinutes: Number(ev.slot_minutes) || 20,
      breakMinutes: Number(ev.break_minutes) || 0,
    });
    if (slots.length < people.length) {
      return res.status(400).json({
        error: `Those hours only make ${slots.length} time${slots.length === 1 ? "" : "s"}, and ${people.length} ${people.length === 1 ? "person has" : "people have"} already paid. Widen the window.`,
      });
    }

    const deadline = new Date(Date.now() + hours * 3600_000);
    const { error: upErr } = await supabase.from("mini_sessions").update({
      date, start_time: startTime, end_time: endTime,
      date_tbd: false,
      ...(locationText ? {
        location_text: locationText,
        location_name: location.locationName,
        address: location.address,
        city: location.city,
        state: location.state,
        zip: location.zip,
      } : {}),
      booking_deadline: deadline.toISOString(),
      booking_opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", ev.id);
    if (upErr) return res.status(500).json({ error: upErr.message });

    // `ev` was read before the update, so its location_text is the OLD one.
    // The whole point of asking here is that this email carries the new address.
    const whereText = locationText || ev.location_text || "";

    const { from, replyTo, orgName, businessInfo } = await orgSender(ev.org_id);
    // Vercel runs as UTC, so without an explicit zone this email told a
    // Nashville customer "Sunday 2:22 AM UTC" for a deadline that is really
    // Saturday 9:22 PM their time — wrong day, and a timezone that means
    // nothing to them. On a deadline that costs them money, that's the whole
    // message. BUSINESS_TZ overrides for anyone running Slate elsewhere.
    const deadlineText = deadline.toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
      timeZone: process.env.BUSINESS_TZ || "America/Chicago",
    });

    // All at once — see the note at the top of this file.
    const sends = people.map(b => (async () => {
      if (!b.email) return;
      const mail = buildMiniClaimEmail(b, { ...ev, date, location_text: whereText }, deadlineText, orgName);
      if (!mail) return;
      await resend.emails.send({
        from, replyTo, to: b.email,
        subject: mail.subject,
        html: brandedEmailWrapper({ orgName, businessInfo: businessInfo as never }, mail.body),
      });
    })());

    const settled = await Promise.allSettled(sends);
    const failed = settled.filter(r => r.status === "rejected").length;
    settled.forEach(r => {
      if (r.status === "rejected") console.warn(`[mini-open-booking] send failed: ${errorMessage(r.reason)}`);
    });

    return res.status(200).json({
      ok: true,
      emailed: people.length - failed,
      failed,
      slots: slots.length,
      deadline: deadline.toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't open booking") });
  }
}
