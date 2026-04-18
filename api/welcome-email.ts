// ============================================================
// Welcome email — sent once after successful signup
//
// Called from LoginPage after supabase.auth.signUp resolves. The user
// still has to verify their email via Supabase's confirmation link, but
// this gives them a proper branded first-touch from SDub Media so they
// know what they signed up for.
//
// Unauthenticated (the user isn't confirmed yet). We rate-limit by email
// to prevent abuse — one welcome email per address per 24h window.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@sdubmedia.com";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

function escape(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { email, name } = (req.body || {}) as { email?: string; name?: string };
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: "Invalid email" });
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, sent: false, reason: "email disabled" });

  // Rate limit: use analytics_events as a lightweight "already sent" log.
  // If we sent a welcome to this email in the last 24h, skip.
  if (supabaseUrl && supabaseServiceKey) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: recent } = await supabase
      .from("analytics_events")
      .select("id")
      .eq("event_name", "welcome_email_sent")
      .eq("metadata->>email", email)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) {
      return res.status(200).json({ ok: true, sent: false, reason: "already sent in last 24h" });
    }
  }

  const displayName = (name || "").trim() || email.split("@")[0];

  try {
    await resend.emails.send({
      from: `SDub Media <${FROM_EMAIL}>`,
      to: email,
      subject: "Welcome to Slate — your production HQ",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #18181b;">
          <h1 style="font-size: 22px; margin: 0 0 8px 0;">Welcome to Slate, ${escape(displayName)}.</h1>
          <p style="font-size: 15px; line-height: 1.55; color: #3f3f46;">
            Slate is your back-office for running a production company — calendar, clients, crew, invoices, contracts, financials, all in one place.
          </p>

          <p style="font-size: 15px; line-height: 1.55; color: #3f3f46;">
            Once you verify your email, here's what most new owners do first:
          </p>
          <ol style="font-size: 15px; line-height: 1.6; color: #18181b; padding-left: 20px;">
            <li><strong>Add your first client</strong> with their billing model (hourly or per-project).</li>
            <li><strong>Add crew members</strong> so you can assign them to upcoming projects.</li>
            <li><strong>Schedule a shoot</strong> from the Calendar — everything else flows from there.</li>
          </ol>

          <p style="font-size: 15px; line-height: 1.55; color: #3f3f46;">
            You're on the <strong>Free plan</strong> — unlimited access to 10 projects to start. Upgrade when you hit that cap.
          </p>

          <p style="font-size: 15px; line-height: 1.55; color: #3f3f46; margin-top: 32px;">
            <a href="https://slate.sdubmedia.com/" style="color: #2563eb; text-decoration: none;">Open Slate →</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;" />
          <p style="font-size: 12px; color: #71717a; line-height: 1.5;">
            Stuck? Reply to this email or write to <a href="mailto:support@sdubmedia.com" style="color: #52525b;">support@sdubmedia.com</a>. A real person (me — Geoff) reads every message.
          </p>
          <p style="font-size: 12px; color: #a1a1aa;">
            SDub Media LLC · Tennessee · <a href="https://slate.sdubmedia.com/terms" style="color: #a1a1aa;">Terms</a> · <a href="https://slate.sdubmedia.com/privacy" style="color: #a1a1aa;">Privacy</a>
          </p>
        </div>
      `,
    });

    // Log the send so rate-limiting works and we have an audit trail.
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await supabase.from("analytics_events").insert({
        event_name: "welcome_email_sent",
        metadata: { app: "slate", email, name: displayName },
      });
    }

    return res.status(200).json({ ok: true, sent: true });
  } catch (err: any) {
    console.error(`[welcome-email] failed: ${err?.message}`);
    return res.status(500).json({ error: err?.message || "Failed to send welcome email" });
  }
}
