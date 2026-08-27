// ============================================================
// Mini sessions — PUBLIC endpoint. No auth: the token is the gate, exactly
// like proposal-accept.ts. Runs under the service role, so THIS FILE is the
// authorization boundary — every query must be scoped by a token.
//
// Actions:
//   get       ?token=<public_token>  event + live availability for the sign-up page
//   book      POST                   claim a slot → pending row → Stripe checkout
//   booking   ?token=<booking_token> the party's own booking page (their QR)
//   schedule  ?slug=<org slug>       every upcoming event for one photographer
//   claim     POST                   a place-holder picks their time + pays the rest
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { errorMessage, isAllowedUrl, publicBusinessInfo } from "./_auth.js";
import { generateSlots, openSlots, pendingExpired, formatSlot, depositDueCents, reservationsLeft } from "./_miniSlots.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const APP_BASE = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";

// Must stay word-for-word identical to UNCLAIMED_BLURB in MiniSessionForm.tsx.
// If these two ever disagree, the owner picked one promise and the customer
// agreed to another.
const UNCLAIMED_BLURB: Record<string, string> = {
  forfeit: "The deposit is not refunded if they don't claim a time.",
  half_refund: "Half the deposit is refunded if they don't claim a time; you keep the other half.",
  credit: "The deposit is held as credit toward a future session if they don't claim a time.",
};

/**
 * True while the times belong exclusively to people who paid a deposit.
 *
 * Between announcing the date and the deadline passing, the public sign-up
 * link must NOT sell slots: a stranger arriving from a flyer would take a time
 * away from someone who has already paid for the right to choose one. Once the
 * deadline passes, whatever is left goes back on general sale.
 */
function holdersOnlyNow(ev: { booking_opened_at?: string | null; booking_deadline?: string | null }): boolean {
  if (!ev.booking_opened_at || !ev.booking_deadline) return false;
  return new Date(ev.booking_deadline).getTime() > Date.now();
}

/** Reservations that still hold a place. An unpaid one whose checkout was
 *  abandoned doesn't — otherwise a walked-away browser eats a place forever. */
function livePlaces(rows: { status: string; payment_status: string; created_at: string }[]) {
  return rows.filter(b => {
    if (b.status === "waitlist" && b.payment_status === "pending") return !pendingExpired(b.created_at);
    return true;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action, token, slug } = req.query;
  // `schedule` is read-only and exists to be embedded in the photographer's own
  // marketing site, so it alone is CORS-open. The state-changing actions below
  // deliberately stay same-origin.
  if (action === "schedule") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
  }
  try {
    switch (action) {
      case "get": return await getEvent(token as string, res);
      case "book": return await book(req, res);
      case "booking": return await getBooking(token as string, res);
      case "pay": return await payBalance(req, res);
      case "claim": return await claimSlot(req, res);
      case "schedule": return await getSchedule(slug as string, res);
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
    .from("mini_session_bookings").select("slot_time, status, created_at, payment_status").eq("mini_session_id", ev.id);

  const spec = { startTime: ev.start_time, endTime: ev.end_time, slotMinutes: ev.slot_minutes, breakMinutes: ev.break_minutes };
  const holdersOnly = holdersOnlyNow(ev);
  const open = ev.status === "published" && !holdersOnly
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

  const depositCents = depositDueCents({
    priceCents: ev.price_cents,
    paymentMode: ev.payment_mode,
    depositPercent: ev.deposit_percent,
    depositFlatCents: ev.deposit_flat_cents,
  });

  const placesLeft = ev.date_tbd
    ? reservationsLeft(ev.reservation_cap, livePlaces((bookings || []) as never))
    : null;

  return res.status(200).json({
    dateTbd: !!ev.date_tbd,
    // While true the public sees no times — they belong to deposit holders.
    holdersOnly,
    holdersUntil: holdersOnly ? ev.booking_deadline : null,
    reservationCap: Number(ev.reservation_cap || 0),
    placesLeft,
    unclaimedPolicy: ev.unclaimed_policy || "forfeit",
    unclaimedBlurb: UNCLAIMED_BLURB[ev.unclaimed_policy || "forfeit"] || UNCLAIMED_BLURB.forfeit,
    bookingDeadline: ev.booking_deadline || null,
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

/**
 * Every upcoming mini session for one photographer, by org slug.
 *
 * This is the "here's my season" page — one stable link and QR that never has
 * to be reprinted, unlike a per-event link. It's also what a photographer's own
 * website embeds, hence the CORS header on this action only.
 *
 * Deliberately never exposes the org id, crew, internal ids or anything a
 * booking needs — only what a poster would say, plus the per-event public token
 * so a card can link straight into the existing sign-up flow.
 */
async function getSchedule(slug: string, res: VercelResponse) {
  const s = clean(slug, 80).toLowerCase();
  if (!s) return res.status(400).json({ error: "Missing slug" });

  const { data: org } = await supabase
    .from("organizations").select("id, name, logo_url, business_info").eq("slug", s).maybeSingle();
  if (!org) return res.status(404).json({ error: "Photographer not found" });

  // One day of slack on the low end: the server runs UTC but the people reading
  // this are in the photographer's timezone, so a same-day event must not
  // vanish at 7pm local. The page does the exact filtering in the viewer's own
  // local time.
  const floor = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const { data: events } = await supabase
    .from("mini_sessions").select("*")
    .eq("org_id", org.id).is("deleted_at", null)
    .in("status", ["published", "closed"])
    .gte("date", floor)
    .order("date", { ascending: true });

  const ids = (events || []).map(e => e.id);
  const { data: allBookings } = ids.length
    ? await supabase.from("mini_session_bookings")
        .select("mini_session_id, slot_time, status, created_at").in("mini_session_id", ids)
    : { data: [] };

  const items = (events || []).map(ev => {
    const spec = { startTime: ev.start_time, endTime: ev.end_time, slotMinutes: ev.slot_minutes, breakMinutes: ev.break_minutes };
    const mine = (allBookings || []).filter(b => b.mini_session_id === ev.id);
    const blocked = Array.isArray(ev.blocked_slots) ? ev.blocked_slots : [];
    // A closed event keeps its row on the page (so the season doesn't look
    // empty) but offers nothing to book.
    const open = ev.status === "published" && !holdersOnlyNow(ev) ? openSlots(spec, heldSlots(mine), blocked) : [];
    const dueNow = ev.payment_mode === "deposit"
      ? Math.round(ev.price_cents * (Number(ev.deposit_percent) || 50) / 100)
      : ev.price_cents;
    return {
      token: ev.public_token,
      title: ev.title,
      date: ev.date,
      startTime: ev.start_time,
      endTime: ev.end_time,
      locationText: ev.location_text,
      slotMinutes: ev.slot_minutes,
      priceCents: ev.price_cents,
      paymentMode: ev.payment_mode,
      dueNowCents: dueNow,
      includedPhotos: ev.included_photos,
      status: ev.status,
      openCount: open.length,
      nextOpenSlot: open[0] || null,
      totalSlots: generateSlots(spec).length,
      bookUrl: `${APP_BASE}/minis/${ev.public_token}`,
    };
  });

  // Narrower than publicBusinessInfo(): that allowlist includes the business
  // address because invoices and proposals need it, but this endpoint is
  // CORS-open and meant to be embedded in a public marketing page — and plenty
  // of photographers have a home address in that field. Contact details only.
  const info = publicBusinessInfo(org.business_info) || {};
  const contact = {
    phone: info.phone, email: info.email, website: info.website, companyName: info.companyName,
  };

  return res.status(200).json({
    orgName: org.name || "",
    orgLogo: org.logo_url || "",
    orgBusinessInfo: contact,
    scheduleUrl: `${APP_BASE}/book/${s}`,
    events: items,
  });
}

async function book(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const { token, slotTime, name, email, phone, source, signatureName } = req.body || {};
  if (!token) return res.status(400).json({ error: "Missing token" });

  const nm = clean(name), em = clean(email), ph = clean(phone, 40);
  const signed = clean(signatureName);
  if (!nm) return res.status(400).json({ error: "Name is required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: "A valid email is required" });
  if (!signed) return res.status(400).json({ error: "Please sign the agreement" });

  const ev = await loadEvent(clean(token, 64));
  if (!ev) return res.status(404).json({ error: "Session not found" });
  if (ev.status !== "published") return res.status(400).json({ error: "This event isn't taking bookings" });

  const { data: existing } = await supabase
    .from("mini_session_bookings")
    .select("slot_time, status, created_at, payment_status").eq("mini_session_id", ev.id);
  const spec = { startTime: ev.start_time, endTime: ev.end_time, slotMinutes: ev.slot_minutes, breakMinutes: ev.break_minutes };

  // Pre-sale: they're buying a PLACE, not a time. The cap is the whole promise
  // — oversell it and somebody pays and never gets photographed — so it is
  // enforced here, server-side, not by hiding a button.
  const isReservation = !!ev.date_tbd;
  let slot = "";
  if (isReservation) {
    const left = reservationsLeft(ev.reservation_cap, livePlaces((existing || []) as never));
    if (left !== null && left <= 0) {
      return res.status(409).json({ error: "All the places have gone.", soldOut: true });
    }
  } else {
    // Deposit holders get first refusal until the deadline. Enforced here, not
    // just hidden in the UI — the endpoint is public.
    if (holdersOnlyNow(ev)) {
      return res.status(409).json({
        error: "These times are held for people who already paid a deposit. Check back after the deadline.",
        holdersOnly: true,
      });
    }
    // Re-derive availability server-side — never trust the browser's slot list.
    slot = clean(slotTime, 5);
    if (!openSlots(spec, heldSlots(existing || []), Array.isArray(ev.blocked_slots) ? ev.blocked_slots : []).includes(slot)) {
      return res.status(409).json({ error: "That time was just taken — pick another.", slotTaken: true });
    }
  }

  const { data: org } = await supabase.from("organizations").select("stripe_account_id, name").eq("id", ev.org_id).single();
  if (!org?.stripe_account_id) return res.status(400).json({ error: "Payment isn't set up for this photographer yet." });

  const dueNow = depositDueCents({
    priceCents: ev.price_cents,
    paymentMode: ev.payment_mode,
    depositPercent: ev.deposit_percent,
    depositFlatCents: ev.deposit_flat_cents,
  });
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
    status: isReservation ? "waitlist" : "pending",
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

    const label = isReservation
      ? `${ev.title || "Mini session"} — place held (deposit)`
      : ev.payment_mode === "deposit"
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
      // Distinct kind: a balance payment must NOT go through the
      // first-payment path, whose replay guard would ignore it (and leave the
      // cron to charge the same card again the day before).
      metadata: { kind: "mini_session_balance", bookingId: b.id, miniSessionId: b.mini_session_id },
      success_url: successUrl,
      cancel_url: bookingUrl,
    }, { stripeAccount: org.stripe_account_id });

    // Its OWN column: overwriting checkout_session_id would orphan the
    // original booking payment if they abandoned this one and went back to
    // finish the first — the webhook would reject it as a mismatch.
    await supabase.from("mini_session_bookings").update({ balance_checkout_session_id: session.id }).eq("id", b.id);
    return res.status(200).json({ ok: true, checkoutUrl: session.url });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't start checkout") });
  }
}

/**
 * A place-holder picks their time and pays the balance.
 *
 * The slot is taken at THIS moment, not when Stripe returns: status flips to
 * `pending` with the slot set, which puts the row under the partial unique
 * index and makes the race unwinnable by two people at once. If they then
 * abandon checkout, the cron returns them to `waitlist` with the slot cleared —
 * they keep the place they paid for, and the time goes back on sale.
 */
async function claimSlot(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const bookingToken = clean(req.body?.token, 64);
  const slot = clean(req.body?.slotTime, 5);
  if (!bookingToken || !slot) return res.status(400).json({ error: "Missing booking or time" });

  const { data: b } = await supabase.from("mini_session_bookings").select("*").eq("booking_token", bookingToken).maybeSingle();
  if (!b) return res.status(404).json({ error: "Booking not found" });
  if (b.status === "cancelled") return res.status(400).json({ error: "This booking was cancelled" });
  if (b.slot_time) return res.status(400).json({ error: "You've already got a time." });
  if (b.status !== "waitlist") return res.status(400).json({ error: "This booking can't pick a time." });

  const { data: ev } = await supabase.from("mini_sessions").select("*").eq("id", b.mini_session_id).maybeSingle();
  if (!ev) return res.status(404).json({ error: "Session not found" });
  if (!ev.booking_opened_at) return res.status(400).json({ error: "Times aren't open yet." });
  if (ev.booking_deadline && new Date(ev.booking_deadline).getTime() < Date.now()) {
    return res.status(400).json({ error: "The window to choose has closed.", closed: true });
  }

  const { data: siblings } = await supabase
    .from("mini_session_bookings").select("slot_time, status, created_at").eq("mini_session_id", ev.id);
  const spec = { startTime: ev.start_time, endTime: ev.end_time, slotMinutes: ev.slot_minutes, breakMinutes: ev.break_minutes };
  if (!openSlots(spec, heldSlots(siblings || []), Array.isArray(ev.blocked_slots) ? ev.blocked_slots : []).includes(slot)) {
    return res.status(409).json({ error: "That time was just taken — pick another.", slotTaken: true });
  }

  const owed = Math.max(0, Number(b.total_cents || 0) - Number(b.deposit_paid_cents || 0));

  // Take the slot now. The unique index is what actually settles a tie between
  // two people claiming the same time in the same second.
  const { error: claimErr } = await supabase.from("mini_session_bookings")
    .update({ slot_time: slot, status: owed > 0 ? "pending" : "booked", updated_at: new Date().toISOString() })
    .eq("id", b.id);
  if (claimErr) {
    if (String(claimErr.code) === "23505") return res.status(409).json({ error: "That time was just taken — pick another.", slotTaken: true });
    return res.status(500).json({ error: claimErr.message });
  }

  // Already paid in full at reservation time — nothing else to collect.
  if (owed <= 0) return res.status(200).json({ ok: true, booked: true });

  const { data: org } = await supabase.from("organizations").select("stripe_account_id, name").eq("id", b.org_id).single();
  if (!org?.stripe_account_id) return res.status(400).json({ error: "Payment isn't set up for this photographer." });

  const bookingUrl = `${APP_BASE}/msb/${b.booking_token}`;
  const successUrl = `${bookingUrl}?paid=1`;
  if (!isAllowedUrl(successUrl) || !isAllowedUrl(bookingUrl)) return res.status(400).json({ error: "Invalid redirect URL" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(b.email ? { customer_email: b.email } : {}),
      ...(b.stripe_customer_id ? { customer: b.stripe_customer_id } : {}),
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `${ev.title || "Mini session"} — ${formatSlot(slot)}`,
            description: `${ev.date} · ${org.name || ""}`.trim(),
          },
          unit_amount: owed,
        },
        quantity: 1,
      }],
      // The first-payment kind on purpose: this confirms the booking itself,
      // which is what confirmMiniBooking does. `mini_session_balance` is for
      // topping up a booking that is already confirmed.
      metadata: { kind: "mini_session", bookingId: b.id, miniSessionId: ev.id },
      success_url: successUrl,
      cancel_url: bookingUrl,
    }, { stripeAccount: org.stripe_account_id });

    const { error: upErr } = await supabase.from("mini_session_bookings")
      .update({ checkout_session_id: session.id }).eq("id", b.id);
    if (upErr) {
      // Hand the time back rather than issue a checkout we can't later verify.
      await supabase.from("mini_session_bookings")
        .update({ slot_time: "", status: "waitlist" }).eq("id", b.id);
      return res.status(500).json({ error: "Couldn't start checkout — please try again." });
    }
    return res.status(200).json({ ok: true, checkoutUrl: session.url });
  } catch (err) {
    await supabase.from("mini_session_bookings")
      .update({ slot_time: "", status: "waitlist" }).eq("id", b.id);
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

  // A place-holder who hasn't picked a time yet. Only offer the picker once the
  // owner has actually opened booking — before that there is no real date.
  const canClaim = b.status === "waitlist" && !b.slot_time && !!ev?.booking_opened_at;
  let claimSlots: string[] = [];
  let claimClosed = false;
  if (canClaim && ev) {
    claimClosed = !!ev.booking_deadline && new Date(ev.booking_deadline).getTime() < Date.now();
    if (!claimClosed) {
      const { data: siblings } = await supabase
        .from("mini_session_bookings").select("slot_time, status, created_at").eq("mini_session_id", ev.id);
      claimSlots = openSlots(
        { startTime: ev.start_time, endTime: ev.end_time, slotMinutes: ev.slot_minutes, breakMinutes: ev.break_minutes },
        heldSlots(siblings || []),
        Array.isArray(ev.blocked_slots) ? ev.blocked_slots : [],
      );
    }
  }

  return res.status(200).json({
    canClaim,
    claimSlots,
    claimClosed,
    claimDeadline: ev?.booking_deadline || null,
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
