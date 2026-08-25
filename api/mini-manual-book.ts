// ============================================================
// Owner adds someone to a mini session by hand — a walk-up who paid cash, or
// a phone booking you want to send a pay link to.
//
// Server-side because the money and the slot claim can't be trusted to the
// browser: the amount comes from the event row, and the same partial unique
// index that protects the public flow protects this one.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { nanoid } from "nanoid";
import { verifyAuth, getUserOrgId, errorMessage, escapeHtml, isAllowedUrl } from "./_auth.js";
import { brandedEmailWrapper } from "./_emailBranding.js";
import { orgSender, qrImgUrl, humanDate, money, APP_BASE } from "./_miniBooking.js";
import { formatSlot, openSlots, pendingExpired } from "./_miniSlots.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const callerOrgId = await getUserOrgId(user.userId);
  if (!callerOrgId) return res.status(403).json({ error: "No organization" });

  // Org membership alone isn't enough: a client/agent login has an org_id too,
  // and this route sends branded email to every participant / takes money on
  // the org's connected account. Same role gate as api/deliveries.ts.
  const { data: callerProfile } = await supabase
    .from("user_profiles").select("role").eq("id", user.userId).single();
  const role = callerProfile?.role;
  if (role !== "owner" && role !== "partner" && role !== "staff") {
    return res.status(403).json({ error: "Not allowed" });
  }

  const { miniSessionId, slotTime, name, email, phone, mode } = req.body || {};
  const nm = clean(name), em = clean(email), ph = clean(phone, 40);
  const slot = clean(slotTime, 5);
  // paid   = they already settled up (cash, Venmo, card in person)
  // paylink = put them on the roster and email them a card link
  const payMode: "paid" | "paylink" = mode === "paylink" ? "paylink" : "paid";

  if (!miniSessionId || !slot) return res.status(400).json({ error: "Missing session or slot" });
  if (!nm) return res.status(400).json({ error: "Name is required" });
  // Email is OPTIONAL for a pay link. A walk-up at the park doesn't want to
  // spell out an address before they can hand over money — the owner shows
  // them the link as a QR and they pay on their own phone. If an email IS
  // given we still send it, so they get their booking and gallery too.
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    return res.status(400).json({ error: "That email doesn't look right" });
  }

  try {
    const { data: ev } = await supabase.from("mini_sessions").select("*").eq("id", clean(miniSessionId, 40)).maybeSingle();
    if (!ev) return res.status(404).json({ error: "Session not found" });
    if (ev.org_id !== callerOrgId) return res.status(403).json({ error: "Not your session" });

    // Same availability rules the public page obeys, so a manual add can't
    // quietly sit on top of a real booking.
    const { data: existing } = await supabase
      .from("mini_session_bookings").select("slot_time, status, created_at").eq("mini_session_id", ev.id);
    const held = (existing || [])
      .filter(b => b.status === "booked" || (b.status === "pending" && !pendingExpired(b.created_at)))
      .map(b => b.slot_time).filter(Boolean);
    const spec = { startTime: ev.start_time, endTime: ev.end_time, slotMinutes: ev.slot_minutes, breakMinutes: ev.break_minutes };
    if (!openSlots(spec, held, Array.isArray(ev.blocked_slots) ? ev.blocked_slots : []).includes(slot)) {
      return res.status(409).json({ error: "That slot isn't open." });
    }

    const bookingId = nanoid(10);
    const bookingToken = nanoid(16);
    const total = Number(ev.price_cents || 0);

    const { error: insErr } = await supabase.from("mini_session_bookings").insert({
      id: bookingId,
      org_id: ev.org_id,
      mini_session_id: ev.id,
      slot_time: slot,
      name: nm, email: em, phone: ph,
      source: "manual",
      booking_token: bookingToken,
      // No signature: the owner took this booking, so there's no click-through
      // agreement to record. Left null deliberately rather than faked.
      signature: null,
      total_cents: total,
      deposit_paid_cents: payMode === "paid" ? total : 0,
      // Booked either way — the owner put them on the roster on purpose, so the
      // slot is theirs whether or not the money has landed.
      status: "booked",
      payment_status: payMode === "paid" ? "paid" : "pending",
    });
    if (insErr) {
      if (String(insErr.code) === "23505") return res.status(409).json({ error: "That slot was just taken." });
      return res.status(500).json({ error: insErr.message });
    }

    const bookingUrl = `${APP_BASE}/msb/${bookingToken}`;
    let payUrl: string | null = null;

    if (payMode === "paylink") {
      const { data: org } = await supabase.from("organizations").select("stripe_account_id, name").eq("id", ev.org_id).single();
      if (!org?.stripe_account_id) {
        return res.status(200).json({
          ok: true, bookingToken,
          warning: "Added to the roster, but Stripe isn't connected so no pay link could be sent.",
        });
      }
      const successUrl = `${bookingUrl}?paid=1`;
      if (!isAllowedUrl(successUrl) || !isAllowedUrl(bookingUrl)) return res.status(400).json({ error: "Invalid redirect URL" });
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...(em ? { customer_email: em } : {}),
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `${ev.title || "Mini session"} — ${formatSlot(slot)}`, description: `${ev.date} · ${org.name || ""}`.trim() },
            unit_amount: total,
          },
          quantity: 1,
        }],
        metadata: { kind: "mini_session", bookingId, miniSessionId: ev.id },
        success_url: successUrl,
        cancel_url: bookingUrl,
      }, { stripeAccount: org.stripe_account_id });
      payUrl = session.url ?? null;
      await supabase.from("mini_session_bookings").update({ checkout_session_id: session.id }).eq("id", bookingId);
    }

    // Email them their spot + QR (and the pay link when there is one). Skipped
    // when the owner didn't have an email for them — a cash walk-up still gets
    // a roster row and a QR the owner can show off his own phone.
    if (em) {
      const { from, replyTo, orgName, businessInfo } = await orgSender(ev.org_id);
      const body = `
        <h2 style="margin:0 0 4px;font-size:18px;color:#059669;">You're on the list ✓</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;">
          ${escapeHtml(nm)}, ${escapeHtml(orgName)} has you booked for ${escapeHtml(ev.title || "a mini session")}.
        </p>
        <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(humanDate(ev.date))} at ${escapeHtml(formatSlot(slot))}</td></tr>
          ${ev.location_text ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Where</td><td style="padding:4px 0;">${escapeHtml(ev.location_text)}</td></tr>` : ""}
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">${payMode === "paid" ? "Paid" : "Due"}</td><td style="padding:4px 0;">${money(total)}</td></tr>
        </table>
        ${payUrl ? `<p style="margin:0 0 16px;text-align:center;">
          <a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#059669;color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600;">Pay ${money(total)}</a>
        </p>` : ""}
        <div style="text-align:center;margin:24px 0;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1e293b;">Have this ready when you arrive</p>
          <img src="${escapeHtml(qrImgUrl(bookingUrl))}" alt="Your check-in code" width="200" height="200" style="display:block;margin:0 auto;border-radius:8px;" />
          <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Your photographer scans this before your session — it's how your photos find their way back to you.</p>
        </div>
        <p style="margin:8px 0;text-align:center;">
          <a href="${escapeHtml(bookingUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View your booking</a>
        </p>`;
      try {
        await resend.emails.send({
          from, replyTo, to: em,
          subject: payMode === "paylink"
            ? `Your spot is held — ${ev.title || "mini session"} ${formatSlot(slot)}`
            : `You're booked — ${ev.title || "mini session"} ${formatSlot(slot)}`,
          html: brandedEmailWrapper({ orgName, businessInfo: businessInfo as never }, body),
        });
      } catch (err) {
        return res.status(200).json({
          ok: true, bookingToken, payUrl,
          warning: `Added, but the email didn't send: ${errorMessage(err)}`,
        });
      }
    }

    return res.status(200).json({ ok: true, bookingToken, payUrl, emailed: !!em });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't add them") });
  }
}
