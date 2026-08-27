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
import { verifyAuth, getUserOrgId, errorMessage, escapeHtml, isAllowedUrl } from "./_auth.js";
import { brandedEmailWrapper } from "./_emailBranding.js";
import { orgSender, humanDate, money, APP_BASE } from "./_miniBooking.js";
import { generateSlots } from "./_miniSlots.js";

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
      booking_deadline: deadline.toISOString(),
      booking_opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", ev.id);
    if (upErr) return res.status(500).json({ error: upErr.message });

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
      const claimUrl = `${APP_BASE}/msb/${b.booking_token}`;
      if (!isAllowedUrl(claimUrl)) return;
      const owed = Math.max(0, Number(b.total_cents || 0) - Number(b.deposit_paid_cents || 0));
      const body = `
        <h2 style="margin:0 0 4px;font-size:18px;">The date is set — pick your time</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;">
          ${escapeHtml(b.name)}, ${escapeHtml(orgName)} has set the date for ${escapeHtml(ev.title || "your mini session")}.
        </p>
        <table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">When</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(humanDate(date))}</td></tr>
          ${ev.location_text ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Where</td><td style="padding:4px 0;">${escapeHtml(ev.location_text)}</td></tr>` : ""}
          ${owed > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Still to pay</td><td style="padding:4px 0;">${money(owed)}</td></tr>` : ""}
        </table>
        <div style="margin:16px 0;padding:14px;border:1px solid #fde68a;background:#fffbeb;border-radius:8px;">
          <p style="margin:0;color:#92400e;font-size:14px;">
            Times are first come, first served. You have until <strong>${escapeHtml(deadlineText)}</strong> to choose.
          </p>
        </div>
        <p style="margin:24px 0;text-align:center;">
          <a href="${escapeHtml(claimUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Choose your time</a>
        </p>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;text-align:center;">
          Everyone holding a place was emailed at the same moment as you.
        </p>`;
      await resend.emails.send({
        from, replyTo, to: b.email,
        subject: `Pick your time — ${ev.title || "mini session"} on ${humanDate(date)}`,
        html: brandedEmailWrapper({ orgName, businessInfo: businessInfo as never }, body),
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
