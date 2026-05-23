// ============================================================
// Daily cron — gallery expiry reminders
// Emails owners 7 days before a gallery expires so they can extend or
// re-deliver if needed. Hits the deliveries.expires_at column.
//
// Schedule: 0 13 * * * (08:00 CDT, registered in vercel.json)
// Auth: Bearer CRON_SECRET (Vercel cron sends this header)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { errorMessage, escapeHtml } from "./_auth.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const REMINDER_DAYS_AHEAD = 7;

interface DeliveryRow {
  id: string;
  org_id: string;
  title: string;
  token: string;
  slug: string | null;
  expires_at: string;
  status: string;
  reminder_sent_at: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Window: [now+6.5d, now+7.5d). One-day window with cron daily prevents
  // both double-sends (idempotent via reminder_sent_at) and missed days.
  const now = Date.now();
  const lower = new Date(now + (REMINDER_DAYS_AHEAD - 0.5) * 86400_000).toISOString();
  const upper = new Date(now + (REMINDER_DAYS_AHEAD + 0.5) * 86400_000).toISOString();

  try {
    const { data: galleries, error } = await supabase
      .from("deliveries")
      .select("id, org_id, title, token, slug, expires_at, status, reminder_sent_at")
      .gte("expires_at", lower)
      .lt("expires_at", upper)
      .in("status", ["sent", "submitted", "working"])
      .is("reminder_sent_at", null);
    if (error) throw new Error(error.message);

    const sent: string[] = [];
    for (const g of (galleries || []) as DeliveryRow[]) {
      // Look up the owner's email
      const { data: owner } = await supabase
        .from("user_profiles")
        .select("email, name")
        .eq("org_id", g.org_id)
        .eq("role", "owner")
        .single();
      if (!owner?.email) continue;

      const url = g.slug
        ? `https://slate.sdubmedia.com/g/${g.slug}`
        : `https://slate.sdubmedia.com/deliver/${g.token}`;
      const expiresLocal = new Date(g.expires_at).toLocaleDateString();

      try {
        await resend.emails.send({
          from: `Slate <${FROM_EMAIL}>`,
          to: owner.email,
          subject: `${escapeHtml(g.title)} expires in ${REMINDER_DAYS_AHEAD} days`,
          html: `
            <p>Hi ${escapeHtml(owner.name || "there")},</p>
            <p>Your gallery <strong>${escapeHtml(g.title)}</strong> is set to expire on <strong>${expiresLocal}</strong>.</p>
            <p>If you want to keep it live, open the gallery in Slate and extend the expiry date.</p>
            <p><a href="https://slate.sdubmedia.com/deliveries/${g.id}">Open in Slate</a> · <a href="${url}">Public link</a></p>
            <p style="color: #888; font-size: 12px">You're getting this because the gallery has an expiry date set. To stop these reminders, clear the expiry date on the gallery.</p>
          `,
        });
        // Mark sent so we don't resend on future runs even if the window slides.
        await supabase.from("deliveries").update({ reminder_sent_at: new Date().toISOString() }).eq("id", g.id);
        sent.push(g.id);
      } catch (mailErr) {
        // Don't fail the whole batch on one bad address — log and continue.
        console.error(`[gallery-expiry] failed for ${g.id}:`, errorMessage(mailErr));
      }
    }

    return res.status(200).json({ ok: true, considered: galleries?.length ?? 0, sent: sent.length });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Cron failed") });
  }
}
