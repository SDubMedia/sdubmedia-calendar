// ============================================================
// Daily mini-session housekeeping — Vercel cron.
//
// For every event happening TOMORROW:
//   1. Charge the outstanding balance to the card saved at booking (the
//      agreement they signed says we will), and on decline flag the booking
//      + email them a pay link instead of silently failing.
//   2. Email each party their reminder — crucially, "have your QR ready",
//      because the whole photo-sorting workflow depends on them showing it.
// Plus: sweep pending bookings whose checkout was abandoned, so their slots
// don't sit unsellable forever.
//
// Auth: Bearer CRON_SECRET. Idempotent via balance_charged_at / reminder_sent_at.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { errorMessage, escapeHtml, isAllowedUrl } from "./_auth.js";
import { brandedEmailWrapper } from "./_emailBranding.js";
import { sendOpsAlert } from "./_opsAlert.js";
import { pingCronitor } from "./_cronitor.js";
import { chargeMiniBalance, orgSender, qrImgUrl, humanDate, money, APP_BASE } from "./_miniBooking.js";
import { formatSlot, PENDING_HOLD_MINUTES } from "./_miniSlots.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const CRONITOR_MONITOR = "slate-mini-sessions";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (req.headers.authorization !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });

  await pingCronitor(CRONITOR_MONITOR, "run");
  const errors: string[] = [];
  let charged = 0, declined = 0, reminded = 0, swept = 0;

  try {
    // ---- 1. Sweep abandoned checkouts (frees the slot) ----
    const cutoff = new Date(Date.now() - PENDING_HOLD_MINUTES * 60_000).toISOString();
    const { data: stale } = await supabase
      .from("mini_session_bookings").select("id")
      .eq("status", "pending").lt("created_at", cutoff);
    if (stale && stale.length > 0) {
      const { error } = await supabase.from("mini_session_bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .in("id", stale.map(x => x.id));
      if (error) errors.push(`sweep: ${error.message}`);
      else swept = stale.length;
    }

    // ---- 2. Tomorrow's events ----
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = ymd(tomorrow);

    const { data: events, error: evErr } = await supabase
      .from("mini_sessions").select("*")
      .eq("date", tomorrowIso).is("deleted_at", null)
      .in("status", ["published", "closed"]);
    if (evErr) throw new Error(evErr.message);

    for (const ev of events || []) {
      const { data: bookings } = await supabase
        .from("mini_session_bookings").select("*")
        .eq("mini_session_id", ev.id).eq("status", "booked");
      if (!bookings || bookings.length === 0) continue;

      const { data: org } = await supabase.from("organizations").select("stripe_account_id").eq("id", ev.org_id).maybeSingle();
      const sender = await orgSender(ev.org_id);

      for (const b of bookings) {
        // --- balance auto-charge ---
        const owed = Math.max(0, Number(b.total_cents || 0) - Number(b.deposit_paid_cents || 0));
        let declineReason: string | null = null;
        if (owed > 0 && !b.balance_charged_at && b.payment_status !== "balance_failed") {
          if (!org?.stripe_account_id) {
            errors.push(`booking=${b.id} no stripe account on org`);
          } else {
            try {
              declineReason = await chargeMiniBalance(stripe, b, org.stripe_account_id);
              if (declineReason) declined++; else charged++;
            } catch (err) {
              declineReason = errorMessage(err, "Charge failed");
              declined++;
              errors.push(`booking=${b.id} charge: ${declineReason}`);
            }
          }
        }

        // --- reminder (+ dunning when the card failed) ---
        if (b.reminder_sent_at && String(b.reminder_sent_at).slice(0, 10) === ymd(new Date())) continue;
        const bookingUrl = `${APP_BASE}/msb/${b.booking_token}`;
        if (!isAllowedUrl(bookingUrl)) continue;
        try {
          const body = `
            <h2 style="margin:0 0 4px;font-size:18px;">See you tomorrow</h2>
            <p style="margin:0 0 16px;color:#64748b;font-size:14px;">
              ${escapeHtml(b.name)}, your ${escapeHtml(ev.title || "mini session")} is tomorrow.
            </p>
            <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
              <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(humanDate(ev.date))} at ${escapeHtml(formatSlot(b.slot_time))}</td></tr>
              ${ev.location_text ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Where</td><td style="padding:4px 0;">${escapeHtml(ev.location_text)}</td></tr>` : ""}
            </table>
            ${declineReason ? `
              <div style="margin:16px 0;padding:14px;border:1px solid #fecaca;background:#fef2f2;border-radius:8px;">
                <p style="margin:0 0 6px;font-weight:600;color:#991b1b;font-size:14px;">We couldn't charge your card for the balance</p>
                <p style="margin:0 0 10px;color:#7f1d1d;font-size:13px;">${money(owed)} is still due. Your session is still on — you can settle it here or in person.</p>
                <a href="${escapeHtml(bookingUrl)}" style="display:inline-block;background:#dc2626;color:#fff;padding:9px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Pay balance</a>
              </div>` : (owed > 0 ? `<p style="margin:0 0 16px;color:#64748b;font-size:13px;">Your remaining ${money(owed)} has been charged to the card on file.</p>` : "")}
            <div style="text-align:center;margin:20px 0;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
              <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1e293b;">Have this ready when you arrive</p>
              <img src="${escapeHtml(qrImgUrl(bookingUrl))}" alt="Your check-in code" width="200" height="200" style="display:block;margin:0 auto;border-radius:8px;" />
              <p style="margin:12px 0 0;font-size:12px;color:#64748b;">Your photographer scans this before your session — it's how your photos find their way back to you. Screenshot it if you'll be somewhere without signal.</p>
            </div>`;
          await resend.emails.send({
            from: sender.from, replyTo: sender.replyTo, to: b.email,
            subject: declineReason
              ? `Tomorrow at ${formatSlot(b.slot_time)} — and a card issue`
              : `Tomorrow at ${formatSlot(b.slot_time)} — ${ev.title || "your mini session"}`,
            html: brandedEmailWrapper({ orgName: sender.orgName, businessInfo: sender.businessInfo as never }, body),
          });
          await supabase.from("mini_session_bookings")
            .update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
          reminded++;
        } catch (err) {
          errors.push(`booking=${b.id} reminder: ${errorMessage(err)}`);
        }
      }
    }
  } catch (err) {
    errors.push(errorMessage(err));
  }

  await pingCronitor(CRONITOR_MONITOR, errors.length === 0 ? "complete" : "fail", {
    message: `charged:${charged} declined:${declined} reminded:${reminded} swept:${swept}`,
  });
  if (errors.length > 0) {
    sendOpsAlert(
      `Mini sessions cron had ${errors.length} error${errors.length === 1 ? "" : "s"}`,
      `Charged: ${charged}\nDeclined: ${declined}\nReminded: ${reminded}\nSwept: ${swept}\n\n${errors.join("\n")}`,
    ).catch(() => {});
  }
  return res.status(200).json({ ok: true, charged, declined, reminded, swept, errors });
}
