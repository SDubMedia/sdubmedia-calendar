// ============================================================
// Mini sessions — PUBLIC endpoint. No auth: the token is the gate, exactly
// like proposal-accept.ts. Runs under the service role, so THIS FILE is the
// authorization boundary — every query must be scoped by a token.
//
// Actions:
//   get      ?token=<public_token>   event + live availability for the sign-up page
//   book     POST                    claim a slot → pending row → Stripe checkout
//   booking  ?token=<booking_token>  the party's own booking page (their QR)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { errorMessage, isAllowedUrl, publicBusinessInfo } from "./_auth.js";
import { generateSlots, openSlots, pendingExpired, formatSlot } from "./_miniSlots.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const APP_BASE = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action, token } = req.query;
  try {
    switch (action) {
      case "get": return await getEvent(token as string, res);
      case "book": return await book(req, res);
      case "booking": return await getBooking(token as string, res);
      case "pay": return await payBalance(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }
}

/** Slot times held by live bookings. A pending row past its hold window is an
 *  abandoned checkout — its slot goes back on sale. */
function heldSlots(bookings: { slot_time: string; status: string; created_at: string }[]): string[] {
  return bookings
    .filter(b => b.status === "booked" || (b.status === "pending" && !pendingExpired(b.created_at)))
    .map(b => b.slot_time)
    .filter(Boolean);
}

async function loadEvent(publicToken: string) {
  const { data } = await supabase.from("mini_sessions").select("*").eq("public_token", publicToken).is("deleted_at", null).maybeSingle();
  return data;
}

async function getEvent(publicToken: string, res: VercelResponse) {
  if (!publicToken) return res.status(400).json({ error: "Missing token" });
  const ev = await loadEvent(publicToken);
  if (!ev) return res.status(404).json({ error: "Session not found" });
  if (ev.status === "draft") return res.status(404).json({ error: "This event isn't open yet" });

  const { data: bookings } = await supabase
    .from("mini_session_bookings").select("slot_time, status, created_at").eq("mini_session_id", ev.id);

  const spec = { startTime: ev.start_time, endTime: ev.end_time, slotMinutes: ev.slot_minutes, breakMinutes: ev.break_minutes };
  const open = ev.status === "published"
    ? openSlots(spec, heldSlots(bookings || []), Array.isArray(ev.blocked_slots) ? ev.blocked_slots : [])
    : [];

  let orgName = "", orgLogo = "", orgBusinessInfo: Record<string, unknown> | null = null, stripeConnected = false;
  if (ev.org_id) {
    const { data: org } = await supabase.from("organizations").select("name, logo_url, business_info, stripe_account_id").eq("id", ev.org_id).single();
    orgName = org?.name || "";
    orgLogo = org?.logo_url || "";
    // Redacted: this object goes to anyone holding the flyer.
    orgBusinessInfo = publicBusinessInfo(org?.business_info);
    stripeConnected = !!org?.stripe_account_id;
  }

  const depositCents = ev.payment_mode === "deposit"
    ? Math.round(ev.price_cents * (Number(ev.deposit_percent) || 50) / 100)
    : ev.price_cents;

  return res.status(200).json({
    title: ev.title,
    date: ev.date,
    locationText: ev.location_text,
    slotMinutes: ev.slot_minutes,
    priceCents: ev.price_cents,
    paymentMode: ev.payment_mode,
    depositPercent: ev.deposit_percent,
    dueNowCents: depositCents,
    agreementText: ev.agreement_text,
    includedPhotos: ev.included_photos,
    perExtraPhotoCents: ev.per_extra_photo_cents,
    status: ev.status,
    openSlots: open,
    totalSlots: generateSlots(spec).length,
    orgName, orgLogo, orgBusinessInfo, stripeConnected,
  });
}

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function book(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const { token, slotTime, name, email, phone, source, signatureName } = req.body || {};
  if (!token || !slotTime) return res.status(400).json({ error: "Missing token or slot" });

  const nm = clean(name), em = clean(email), ph = clean(phone, 40);
  const signed = clean(signatureName);
  if (!nm) return res.status(400).json({ error: "Name is required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: "A valid email is required" });
  if (!signed) return res.status(400).json({ error: "Please sign the agreement" });

  const ev = await loadEvent(clean(token, 64));
  if (!ev) return res.status(404).json({ error: "Session not found" });
  if (ev.status !== "published") return res.status(400).json({ error: "This event isn't taking bookings" });

  // Re-derive availability server-side — never trust the browser's slot list.
  const { data: existing } = await supabase
    .from("mini_session_bookings").select("slot_time, status, created_at").eq("mini_session_id", ev.id);
  const spec = { startTime: ev.start_time, endTime: ev.end_time, slotMinutes: ev.slot_minutes, breakMinutes: ev.break_minutes };
  const slot = clean(slotTime, 5);
  if (!openSlots(spec, heldSlots(existing || []), Array.isArray(ev.blocked_slots) ? ev.blocked_slots : []).includes(slot)) {
    return res.status(409).json({ error: "That time was just taken — pick another.", slotTaken: true });
  }

  const { data: org } = await supabase.from("organizations").select("stripe_account_id, name").eq("id", ev.org_id).single();
  if (!org?.stripe_account_id) return res.status(400).json({ error: "Payment isn't set up for this photographer yet." });

  const dueNow = ev.payment_mode === "deposit"
    ? Math.round(ev.price_cents * (Number(ev.deposit_percent) || 50) / 100)
    : ev.price_cents;
  if (dueNow <= 0) return res.status(400).json({ error: "This event has no price set." });

  const bookingId = nanoid(10);
  const bookingToken = nanoid(16);
  const ip = req.headers["x-forwarded-for"];

  // The partial unique index on (mini_session_id, slot_time) is what actually
  // prevents a double-book: two people checking out for 2:15 in the same
  // instant means the loser's INSERT fails here, not a corrupted roster.
  const { error: insErr } = await supabase.from("mini_session_bookings").insert({
    id: bookingId,
    org_id: ev.org_id,
    mini_session_id: ev.id,
    slot_time: slot,
    name: nm, email: em, phone: ph,
    source: clean(source, 60),
    booking_token: bookingToken,
    signature: {
      name: signed,
      ip: Array.isArray(ip) ? ip[0] : ip,
      timestamp: new Date().toISOString(),
      // Pins WHICH wording they agreed to, so later edits can't rewrite history.
      agreementHash: createHash("sha256").update(String(ev.agreement_text || "")).digest("hex").slice(0, 32),
    },
    total_cents: ev.price_cents,
    status: "pending",
    payment_status: "pending",
  });
  if (insErr) {
    if (String(insErr.code) === "23505") return res.status(409).json({ error: "That time was just taken — pick another.", slotTaken: true });
    return res.status(500).json({ error: insErr.message });
  }

  try {
    // Customer on the CONNECTED account (same pattern as stripe-save-card).
    const customer = await stripe.customers.create(
      { email: em, name: nm, metadata: { miniBookingId: bookingId } },
      { stripeAccount: org.stripe_account_id },
    );

    const successUrl = `${APP_BASE}/msb/${bookingToken}?paid=1`;
    const cancelUrl = `${APP_BASE}/minis/${ev.public_token}`;
    if (!isAllowedUrl(successUrl) || !isAllowedUrl(cancelUrl)) return res.status(400).json({ error: "Invalid redirect URL" });

    const label = ev.payment_mode === "deposit"
      ? `${ev.title || "Mini session"} — ${formatSlot(slot)} (deposit)`
      : `${ev.title || "Mini session"} — ${formatSlot(slot)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customer.id,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: label, description: `${ev.date} · ${org.name || ""}`.trim() },
          unit_amount: dueNow,
        },
        quantity: 1,
      }],
      // Deposit bookings save the card so the balance can be charged the day
      // before without asking again — the agreement they just signed says so.
      ...(ev.payment_mode === "deposit"
        ? { payment_intent_data: { setup_future_usage: "off_session" as const } }
        : {}),
      metadata: { kind: "mini_session", bookingId, miniSessionId: ev.id },
      success_url: successUrl,
      cancel_url: cancelUrl,
    }, { stripeAccount: org.stripe_account_id });

    // Both the webhook and the booking page hard-require this id to match, so
    // a failed write must not hand out a checkout URL we can't later verify.
    const { error: upErr } = await supabase.from("mini_session_bookings")
      .update({ checkout_session_id: session.id, stripe_customer_id: customer.id })
      .eq("id", bookingId);
    if (upErr) {
      await supabase.from("mini_session_bookings").update({ status: "cancelled" }).eq("id", bookingId);
      return res.status(500).json({ error: "Couldn't start checkout — please try again." });
    }

    return res.status(200).json({ ok: true, checkoutUrl: session.url, bookingToken });
  } catch (err) {
    // Free the slot again rather than leaving a zombie pending row on it.
    await supabase.from("mini_session_bookings").update({ status: "cancelled" }).eq("id", bookingId);
    return res.status(500).json({ error: errorMessage(err, "Couldn't start checkout") });
  }
}

/**
 * Pay whatever is still owed on a booking, from their own booking page.
 * Needed because a booking can be outstanding for reasons that have nothing
 * to do with a declined card — an owner-added phone booking never had one —
 * and "contact the photographer" is a dead end when they just want to pay.
 */
async function payBalance(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const bookingToken = clean(req.body?.token, 64);
  if (!bookingToken) return res.status(400).json({ error: "Missing token" });

  const { data: b } = await supabase.from("mini_session_bookings").select("*").eq("booking_token", bookingToken).maybeSingle();
  if (!b) return res.status(404).json({ error: "Booking not found" });
  if (b.status === "cancelled") return res.status(400).json({ error: "This booking was cancelled" });

  const owed = Math.max(0, Number(b.total_cents || 0) - Number(b.deposit_paid_cents || 0));
  if (owed <= 0) return res.status(400).json({ error: "Nothing left to pay" });

  const { data: ev } = await supabase.from("mini_sessions").select("title, date, org_id").eq("id", b.mini_session_id).maybeSingle();
  const { data: org } = await supabase.from("organizations").select("stripe_account_id, name").eq("id", b.org_id).single();
  if (!org?.stripe_account_id) return res.status(400).json({ error: "Payment isn't set up for this photographer." });

  const bookingUrl = `${APP_BASE}/msb/${b.booking_token}`;
  const successUrl = `${bookingUrl}?paid=1`;
  if (!isAllowedUrl(successUrl) || !isAllowedUrl(bookingUrl)) return res.status(400).json({ error: "Invalid redirect URL" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(b.email ? { customer_email: b.email } : {}),
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `${ev?.title || "Mini session"} — ${formatSlot(b.slot_time)}`,
            description: `${ev?.date || ""} · ${org.name || ""}`.trim(),
          },
          unit_amount: owed,
        },
        quantity: 1,
      }],
      metadata: { kind: "mini_session", bookingId: b.id, miniSessionId: b.mini_session_id },
      success_url: successUrl,
      cancel_url: bookingUrl,
    }, { stripeAccount: org.stripe_account_id });

    // The webhook requires the session id to match before it settles anything.
    await supabase.from("mini_session_bookings").update({ checkout_session_id: session.id }).eq("id", b.id);
    return res.status(200).json({ ok: true, checkoutUrl: session.url });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't start checkout") });
  }
}

async function getBooking(bookingToken: string, res: VercelResponse) {
  if (!bookingToken) return res.status(400).json({ error: "Missing token" });
  const { data: b } = await supabase.from("mini_session_bookings").select("*").eq("booking_token", bookingToken).maybeSingle();
  if (!b) return res.status(404).json({ error: "Booking not found" });

  const { data: ev } = await supabase.from("mini_sessions").select("*").eq("id", b.mini_session_id).maybeSingle();
  let orgName = "", orgBusinessInfo: Record<string, unknown> | null = null;
  if (b.org_id) {
    const { data: org } = await supabase.from("organizations").select("name, business_info").eq("id", b.org_id).single();
    orgName = org?.name || "";
    orgBusinessInfo = publicBusinessInfo(org?.business_info);
  }

  let galleryToken: string | null = null;
  if (b.delivery_id) {
    const { data: d } = await supabase.from("deliveries").select("token, slug, status").eq("id", b.delivery_id).maybeSingle();
    if (d && d.status !== "draft") galleryToken = d.slug || d.token;
  }

  const balanceCents = Math.max(0, Number(b.total_cents || 0) - Number(b.deposit_paid_cents || 0));
  return res.status(200).json({
    name: b.name,
    slotTime: b.slot_time,
    status: b.status,
    paymentStatus: b.payment_status,
    depositPaidCents: b.deposit_paid_cents,
    totalCents: b.total_cents,
    balanceCents,
    bookingToken: b.booking_token,
    reminderSentAt: b.reminder_sent_at,
    galleryToken,
    event: ev ? {
      title: ev.title, date: ev.date, locationText: ev.location_text,
      slotMinutes: ev.slot_minutes, includedPhotos: ev.included_photos,
      agreementText: ev.agreement_text, paymentMode: ev.payment_mode,
    } : null,
    orgName, orgBusinessInfo,
  });
}
