// ============================================================
// Shared mini-session booking side effects. Lives here (underscore = not
// routed) because both the Stripe webhook and the cron need them.
// ============================================================

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { errorMessage, escapeHtml, isAllowedUrl } from "./_auth.js";
import { brandedEmailWrapper } from "./_emailBranding.js";
import { sendPushToOwner } from "./_apns.js";
import { formatSlot } from "./_miniSlots.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const VERIFIED_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@slate.sdubmedia.com";
export const APP_BASE = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";

export function humanDate(iso: string): string {
  const d = new Date(String(iso || "") + "T00:00:00");
  if (isNaN(d.getTime())) return iso || "";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function money(cents: number): string {
  return `$${(Math.round(Number(cents) || 0) / 100).toFixed(2)}`;
}

/** Sender identity for a given org: verified domain in `from`, the org's own
 *  address as reply-to (see cron-payment-reminders for why). */
export async function orgSender(orgId: string): Promise<{ from: string; replyTo: string; orgName: string; businessInfo: Record<string, unknown> | null }> {
  const { data: org } = await supabase.from("organizations").select("name, business_info").eq("id", orgId).maybeSingle();
  const orgName = org?.name || "Your photographer";
  const bi = (org?.business_info || {}) as { email?: string };
  return {
    from: `${orgName} <${VERIFIED_FROM_EMAIL}>`,
    replyTo: bi.email?.trim() || VERIFIED_FROM_EMAIL,
    orgName,
    businessInfo: (org?.business_info as Record<string, unknown>) || null,
  };
}

/** Hosted QR image for a URL — emails can't use data: URLs. */
export function qrImgUrl(target: string, size = 320): string {
  return `${APP_BASE}/api/qr?d=${encodeURIComponent(target)}&s=${size}`;
}

/**
 * Payment cleared → the slot is really theirs. Flips the row, records the
 * saved card, emails their confirmation (with the QR they'll be scanned from)
 * and nudges the owner. Idempotent: a webhook replay won't re-send.
 */
export async function confirmMiniBooking(bookingId: string, session: { amount_total?: number | null; id?: string; payment_intent?: unknown }) {
  const { data: b } = await supabase.from("mini_session_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return;
  // Already settled (webhook replay / double delivery) — do nothing.
  //
  // `status === "pending"` means there is a checkout in flight that still has
  // to be settled, so it is NOT a replay even when money has already been taken
  // on this booking. That case is real: a pre-sale holder pays a deposit
  // (deposit_paid), later claims a time (back to pending), and pays the
  // balance. Guarding on payment alone made that second payment a no-op — they
  // were charged and the booking silently stayed pending until the sweep
  // released their slot.
  //
  // The other half still holds: an owner-added booking is already "booked"
  // while its pay link is outstanding, and that payment must still register.
  if (b.status !== "pending" && (b.payment_status === "paid" || b.payment_status === "deposit_paid")) return;
  // Only the session we created for THIS booking may confirm it.
  if (b.checkout_session_id && session.id && b.checkout_session_id !== session.id) return;

  const thisPayment = Math.round(Number(session.amount_total ?? 0));
  const total = Number(b.total_cents || 0);
  // Cumulative, never replaced. A claim's checkout is for the BALANCE, so
  // writing it straight over deposit_paid_cents erased the deposit already
  // taken and left a fully-paid customer reading as still owing it. Adding is
  // also correct for a first payment, where the existing figure is zero.
  const paid = Math.round(Number(b.deposit_paid_cents || 0)) + thisPayment;
  const fullyPaid = paid >= total;

  // A pre-sale reservation has no slot yet — it stays on the waitlist until the
  // date is announced and they claim a time. Forcing it to "booked" would both
  // lie about what they hold and put it under the slot-uniqueness index with an
  // empty slot_time, where the second reservation would collide with the first.
  const isReservation = !b.slot_time;

  await supabase.from("mini_session_bookings").update({
    status: isReservation ? "waitlist" : "booked",
    payment_status: fullyPaid ? "paid" : "deposit_paid",
    deposit_paid_cents: paid,
    updated_at: new Date().toISOString(),
  }).eq("id", bookingId);

  const { data: ev } = await supabase.from("mini_sessions").select("*").eq("id", b.mini_session_id).maybeSingle();
  const { from, replyTo, orgName, businessInfo } = await orgSender(b.org_id);
  const bookingUrl = `${APP_BASE}/msb/${b.booking_token}`;
  const balance = Math.max(0, total - paid);

  const results = await Promise.allSettled([
    (async () => {
      if (!isAllowedUrl(bookingUrl)) return;
      const body = `
        <h2 style="margin:0 0 4px;font-size:18px;color:#059669;">You're booked ✓</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;">
          ${escapeHtml(b.name)}, your ${escapeHtml(ev?.title || "mini session")} is confirmed.
        </p>
        <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(humanDate(ev?.date || ""))} at ${escapeHtml(formatSlot(b.slot_time))}</td></tr>
          ${ev?.location_text ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Where</td><td style="padding:4px 0;">${escapeHtml(ev.location_text)}</td></tr>` : ""}
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Paid</td><td style="padding:4px 0;">${money(paid)}</td></tr>
          ${balance > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Balance</td><td style="padding:4px 0;">${money(balance)} — charged to your card the day before</td></tr>` : ""}
        </table>
        <div style="text-align:center;margin:24px 0;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1e293b;">Have this ready when you arrive</p>
          <img src="${escapeHtml(qrImgUrl(bookingUrl))}" alt="Your check-in code" width="200" height="200" style="display:block;margin:0 auto;border-radius:8px;" />
          <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Your photographer scans this before your session — it's how your photos find their way back to you.</p>
        </div>
        <p style="margin:8px 0;text-align:center;">
          <a href="${escapeHtml(bookingUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View your booking</a>
        </p>`;
      await resend.emails.send({
        from, replyTo, to: b.email,
        subject: `You're booked — ${ev?.title || "mini session"} ${formatSlot(b.slot_time)}`,
        html: brandedEmailWrapper({ orgName, businessInfo: businessInfo as never }, body),
      });
    })(),
    sendPushToOwner(b.org_id, {
      title: "Mini session booked",
      body: `${b.name} took ${formatSlot(b.slot_time)} — ${money(paid)}${balance > 0 ? ` (${money(balance)} due)` : ""}`,
      data: { type: "mini_session" },
    }),
  ]);
  results.forEach((x, i) => {
    if (x.status === "rejected") console.warn(`[mini-booking] ${i === 0 ? "confirmation email" : "owner push"} failed: ${errorMessage(x.reason)}`);
  });
}

/**
 * An outstanding balance was paid by hand (their booking page's Pay button, or
 * an owner-sent pay link on a booking that already had a deposit). Adds the
 * amount, marks it settled, and — critically — stamps balance_charged_at so
 * the day-before cron doesn't charge the card for money already received.
 */
export async function settleMiniBalance(bookingId: string, session: { amount_total?: number | null; id?: string }) {
  const { data: b } = await supabase.from("mini_session_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return;
  if (b.payment_status === "paid") return; // replay
  // Only the balance session we minted for this booking may credit it — a
  // stale session from an abandoned attempt at a different amount must not.
  if (b.balance_checkout_session_id && session.id && b.balance_checkout_session_id !== session.id) return;

  const paid = Math.round(Number(session.amount_total ?? 0));
  const already = Number(b.deposit_paid_cents || 0);
  const total = Number(b.total_cents || 0);
  const nowIso = new Date().toISOString();

  await supabase.from("mini_session_bookings").update({
    deposit_paid_cents: already + paid,
    payment_status: already + paid >= total ? "paid" : "deposit_paid",
    balance_charged_at: nowIso,
    balance_error: "",
    updated_at: nowIso,
  }).eq("id", bookingId);

  const { data: ev } = await supabase.from("mini_sessions").select("title").eq("id", b.mini_session_id).maybeSingle();
  const results = await Promise.allSettled([
    (async () => {
      if (!b.email) return;
      const { from, replyTo, orgName, businessInfo } = await orgSender(b.org_id);
      const body = `
        <h2 style="margin:0 0 4px;font-size:18px;color:#059669;">Payment received ✓</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;">
          Thanks ${escapeHtml(b.name)} — we've received ${money(paid)} for ${escapeHtml(ev?.title || "your session")}. You're paid in full.
        </p>`;
      await resend.emails.send({
        from, replyTo, to: b.email,
        subject: `Payment received — ${ev?.title || "your session"}`,
        html: brandedEmailWrapper({ orgName, businessInfo: businessInfo as never }, body),
      });
    })(),
    sendPushToOwner(b.org_id, {
      title: "Balance paid",
      body: `${b.name} paid ${money(paid)}`,
      data: { type: "mini_session" },
    }),
  ]);
  results.forEach((x, i) => {
    if (x.status === "rejected") console.warn(`[mini-balance] ${i === 0 ? "receipt" : "push"} failed: ${errorMessage(x.reason)}`);
  });
}

/** Off-session charge of the outstanding balance, mirroring the per-card retry
 *  shape of charge-agent-card.ts. Returns null on success, else the error. */
export async function chargeMiniBalance(
  stripe: Stripe,
  booking: { id: string; org_id: string; stripe_customer_id: string | null; total_cents: number; deposit_paid_cents: number },
  stripeAccount: string,
): Promise<string | null> {
  const amount = Math.max(0, Number(booking.total_cents || 0) - Number(booking.deposit_paid_cents || 0));
  if (amount <= 0) return null;
  if (!booking.stripe_customer_id) return "No saved card on this booking";

  const pms = await stripe.paymentMethods.list(
    { customer: booking.stripe_customer_id, type: "card", limit: 10 },
    { stripeAccount },
  );
  if (pms.data.length === 0) return "No saved card on this booking";

  let lastErr = "Card was declined";
  for (const pm of pms.data) {
    try {
      const intent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        customer: booking.stripe_customer_id,
        payment_method: pm.id,
        off_session: true,
        confirm: true,
        metadata: { kind: "mini_session_balance", bookingId: booking.id },
      }, { stripeAccount });
      await supabase.from("mini_session_bookings").update({
        payment_status: "paid",
        deposit_paid_cents: Number(booking.total_cents || 0),
        balance_charged_at: new Date().toISOString(),
        balance_payment_intent_id: intent.id,
        balance_error: "",
        updated_at: new Date().toISOString(),
      }).eq("id", booking.id);
      return null;
    } catch (err) {
      // A declined off-session intent never captures funds; 3DS-required
      // lands here too. Try the next saved card before giving up.
      lastErr = errorMessage(err, "Card was declined");
    }
  }

  await supabase.from("mini_session_bookings").update({
    payment_status: "balance_failed",
    balance_error: lastErr.slice(0, 300),
    updated_at: new Date().toISOString(),
  }).eq("id", booking.id);
  return lastErr;
}
