// ============================================================
// Daily summary — Vercel cron fires every day at 11:00 UTC
// (~6am CDT / 5am CST in Nashville) and emails Geoff an ops
// roll-up for Slate + Freelance covering the last 24 hours.
//
// Protected by CRON_SECRET env var. Also callable manually with the
// same Authorization: Bearer <CRON_SECRET> header for ad-hoc runs.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@sdubmedia.com";
const TO_EMAIL = process.env.FEEDBACK_TO_EMAIL || "geoff@sdubmedia.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Reject anything else.
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });

  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // --- Slate MRR + active subs ---
  const { data: slateOrgs } = await supabase
    .from("organizations")
    .select("id, name, plan, billing_status")
    .in("plan", ["basic", "pro"])
    .neq("billing_status", "cancelled");

  const slateMrr = (slateOrgs || []).reduce((s, o) => s + (o.plan === "pro" ? 19.99 : o.plan === "basic" ? 9.99 : 0), 0);
  const slatePastDue = (slateOrgs || []).filter(o => o.billing_status === "past_due").length;

  // --- Freelance MRR + active subs ---
  const { data: freelanceProfiles } = await supabase
    .from("producer_profiles")
    .select("id, display_name, email, subscription_tier, subscription_status")
    .in("subscription_tier", ["freelance", "freelance_pro"])
    .in("subscription_status", ["active", "trialing", "past_due"]);

  const freelanceMrr = (freelanceProfiles || []).reduce((s, p) => s + (p.subscription_tier === "freelance_pro" ? 19.99 : p.subscription_tier === "freelance" ? 9.99 : 0), 0);
  const freelancePastDue = (freelanceProfiles || []).filter(p => p.subscription_status === "past_due").length;

  // --- New Slate signups (last 24h) ---
  const { count: slateSignups } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .neq("id", "org_sdubmedia")
    .gte("created_at", since);

  // --- New Freelance signups (last 24h) ---
  const { count: freelanceSignups } = await supabase
    .from("producer_profiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  // --- Conversion funnel (last 24h) ---
  const { data: events } = await supabase
    .from("analytics_events")
    .select("event_name, metadata")
    .gte("created_at", since);

  const funnel = { slate: { viewed: 0, started: 0, completed: 0 }, freelance: { viewed: 0, started: 0, completed: 0 } };
  for (const ev of events || []) {
    const app = ((ev.metadata as any)?.app || "").toLowerCase() as "slate" | "freelance";
    if (!funnel[app]) continue;
    if (ev.event_name === "upgrade_dialog_viewed") funnel[app].viewed++;
    else if (ev.event_name === "checkout_started") funnel[app].started++;
    else if (ev.event_name === "checkout_completed") funnel[app].completed++;
  }

  // --- Compose email ---
  const totalMrr = (slateMrr + freelanceMrr).toFixed(2);
  const slateSubs = (slateOrgs || []).length;
  const freelanceSubs = (freelanceProfiles || []).length;

  const subject = `[SDub Daily] MRR $${totalMrr} · ${slateSubs + freelanceSubs} subs · ${(slateSignups || 0) + (freelanceSignups || 0)} new signups`;

  const body = `
Daily roll-up (last 24 hours).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MRR (current state)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Slate:     $${slateMrr.toFixed(2)}  (${slateSubs} active)
  Freelance: $${freelanceMrr.toFixed(2)}  (${freelanceSubs} active)
  Total:     $${totalMrr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Last 24 hours
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  New Slate signups:     ${slateSignups || 0}
  New Freelance signups: ${freelanceSignups || 0}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Conversion funnel (last 24h)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Slate:     ${funnel.slate.viewed} viewed → ${funnel.slate.started} started → ${funnel.slate.completed} completed
  Freelance: ${funnel.freelance.viewed} viewed → ${funnel.freelance.started} started → ${funnel.freelance.completed} completed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Needs attention
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Slate past-due:     ${slatePastDue}
  Freelance past-due: ${freelancePastDue}

For deeper cuts, see docs/admin-queries.sql.
`.trim();

  try {
    await resend.emails.send({
      from: `SDub Daily <${FROM_EMAIL}>`,
      to: TO_EMAIL,
      subject,
      text: body,
    });
    return res.status(200).json({ ok: true, subject });
  } catch (err: any) {
    console.error(`[weekly-summary] failed: ${err?.message}`);
    return res.status(500).json({ error: err?.message });
  }
}
