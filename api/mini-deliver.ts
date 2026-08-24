// ============================================================
// Emails each mini-session party the link to THEIR gallery.
//
// The normal gallery sender (notify-gallery-ready) can't do this: it demands a
// linked project and a client record, and mini-session bookings are strangers
// with nothing but a name and an email. Same brand shell, same public
// /deliver/<token> URL — just resolved from the booking instead.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { verifyAuth, getUserOrgId, errorMessage, escapeHtml, isAllowedUrl } from "./_auth.js";
import { brandedEmailWrapper } from "./_emailBranding.js";
import { orgSender, humanDate, APP_BASE } from "./_miniBooking.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);

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

  const miniSessionId = typeof req.body?.miniSessionId === "string" ? req.body.miniSessionId.slice(0, 40) : "";
  // Optional: resend one person's gallery rather than the whole event.
  const onlyBookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId.slice(0, 40) : "";
  // Deliberate re-send of galleries that already went out, rather than the
  // default "only the ones nobody has received yet".
  const force = req.body?.force === true;
  if (!miniSessionId) return res.status(400).json({ error: "Missing session" });

  try {
    const { data: ev } = await supabase.from("mini_sessions").select("*").eq("id", miniSessionId).maybeSingle();
    if (!ev) return res.status(404).json({ error: "Session not found" });
    if (ev.org_id !== callerOrgId) return res.status(403).json({ error: "Not your session" });

    let q = supabase.from("mini_session_bookings").select("*")
      .eq("mini_session_id", ev.id).not("delivery_id", "is", null);
    if (onlyBookingId) q = q.eq("id", onlyBookingId);
    const { data: bookings } = await q;
    if (!bookings || bookings.length === 0) return res.status(400).json({ error: "No galleries to send yet" });

    const { from, replyTo, orgName, businessInfo } = await orgSender(ev.org_id);
    let sent = 0, skipped = 0;
    const errors: string[] = [];

    for (const b of bookings) {
      if (!b.email) { skipped++; continue; }
      const { data: d } = await supabase.from("deliveries")
        .select("id, token, slug, status").eq("id", b.delivery_id).maybeSingle();
      if (!d) { skipped++; continue; }
      // Already delivered — don't spam them on a second run over the event.
      if (!onlyBookingId && !force && d.status === "delivered") { skipped++; continue; }

      const galleryUrl = `${APP_BASE}/${d.slug ? `g/${d.slug}` : `deliver/${d.token}`}`;
      if (!isAllowedUrl(galleryUrl)) { skipped++; continue; }

      // How many they get to pick before extras cost money — same numbers the
      // gallery itself enforces, so the email can't promise something else.
      const included = Number(ev.included_photos || 0);
      const extraCents = Number(ev.per_extra_photo_cents || 0);

      const body = `
        <h2 style="margin:0 0 4px;font-size:18px;">Your photos are ready</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;">
          ${escapeHtml(b.name)}, here are your images from ${escapeHtml(ev.title || "your session")}${ev.date ? ` on ${escapeHtml(humanDate(ev.date))}` : ""}.
        </p>
        ${included > 0 ? `<p style="margin:0 0 16px;color:#64748b;font-size:14px;">
          Your session includes <strong>${included} edited image${included === 1 ? "" : "s"}</strong> — pick your favourites in the gallery${extraCents > 0 ? `, and you can add more at $${(extraCents / 100).toFixed(2)} each` : ""}.
        </p>` : ""}
        <p style="margin:24px 0;text-align:center;">
          <a href="${escapeHtml(galleryUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">View your gallery</a>
        </p>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;text-align:center;">
          This link is yours — it opens only your photos.
        </p>`;

      try {
        await resend.emails.send({
          from, replyTo, to: b.email,
          subject: `Your photos are ready — ${ev.title || "mini session"}`,
          html: brandedEmailWrapper({ orgName, businessInfo: businessInfo as never }, body),
        });
        await supabase.from("deliveries").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", d.id);
        sent++;
      } catch (err) {
        errors.push(`${b.name}: ${errorMessage(err)}`);
      }
    }

    return res.status(200).json({ ok: true, sent, skipped, errors });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't send the galleries") });
  }
}
