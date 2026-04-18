// ============================================================
// Daily summary — Vercel cron fires every day at 11:00 UTC
// (~6am CDT / 5am CST in Nashville) and emails Geoff an ops
// roll-up for Slate + Freelance covering the last 24 hours
// plus a weekly delta and a named past-due list.
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

const DAY_MS = 24 * 60 * 60 * 1000;

function mrrForPlan(plan: string | null | undefined): number {
  if (plan === "pro" || plan === "freelance_pro") return 19.99;
  if (plan === "basic" || plan === "freelance") return 9.99;
  return 0;
}

// Format a drop-off arrow: "12 → 5 (42%)"
function stepFmt(from: number, to: number): string {
  if (from === 0) return `${to}`;
  const pct = Math.round((to / from) * 100);
  return `${to} (${pct}%)`;
}

// Signed delta string: "+3" / "-2" / "—"
function deltaFmt(curr: number, prev: number): string {
  const d = curr - prev;
  if (d === 0) return "—";
  return d > 0 ? `+${d}` : `${d}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });

  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = Date.now();
  const since24h = new Date(now - DAY_MS).toISOString();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();
  const since14d = new Date(now - 14 * DAY_MS).toISOString();

  // --- Slate: current active state + past-due names ---
  const { data: slateOrgs } = await supabase
    .from("organizations")
    .select("id, name, plan, billing_status")
    .in("plan", ["basic", "pro"])
    .neq("billing_status", "cancelled");

  const slateMrr = (slateOrgs || []).reduce((s, o) => s + mrrForPlan(o.plan), 0);
  const slatePastDue = (slateOrgs || []).filter(o => o.billing_status === "past_due");
  const slateSubs = (slateOrgs || []).length;

  // --- Freelance: current active state + past-due names ---
  const { data: freelanceProfiles } = await supabase
    .from("producer_profiles")
    .select("id, display_name, email, subscription_tier, subscription_status")
    .in("subscription_tier", ["freelance", "freelance_pro"])
    .in("subscription_status", ["active", "trialing", "past_due"]);

  const freelanceMrr = (freelanceProfiles || []).reduce((s, p) => s + mrrForPlan(p.subscription_tier), 0);
  const freelancePastDue = (freelanceProfiles || []).filter(p => p.subscription_status === "past_due");
  const freelanceSubs = (freelanceProfiles || []).length;

  // --- Signup counts: 24h, last-7d, prior-7d ---
  async function countRows(table: "organizations" | "producer_profiles", sinceIso: string, untilIso?: string): Promise<number> {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).gte("created_at", sinceIso);
    if (untilIso) q = q.lt("created_at", untilIso);
    if (table === "organizations") q = q.neq("id", "org_sdubmedia");
    const { count } = await q;
    return count || 0;
  }

  const [slate24h, slate7d, slatePrior7d, free24h, free7d, freePrior7d] = await Promise.all([
    countRows("organizations", since24h),
    countRows("organizations", since7d),
    countRows("organizations", since14d, since7d),
    countRows("producer_profiles", since24h),
    countRows("producer_profiles", since7d),
    countRows("producer_profiles", since14d, since7d),
  ]);

  // --- Conversion funnel (last 24h + last 7d) ---
  type AppKey = "slate" | "freelance";
  type Funnel = Record<AppKey, { viewed: number; started: number; completed: number }>;
  const empty = (): Funnel => ({ slate: { viewed: 0, started: 0, completed: 0 }, freelance: { viewed: 0, started: 0, completed: 0 } });

  async function loadFunnel(sinceIso: string): Promise<Funnel> {
    const { data } = await supabase.from("analytics_events").select("event_name, metadata").gte("created_at", sinceIso);
    const f = empty();
    for (const ev of data || []) {
      const app = ((ev.metadata as any)?.app || "").toLowerCase() as AppKey;
      if (app !== "slate" && app !== "freelance") continue;
      if (ev.event_name === "upgrade_dialog_viewed") f[app].viewed++;
      else if (ev.event_name === "checkout_started") f[app].started++;
      else if (ev.event_name === "checkout_completed") f[app].completed++;
    }
    return f;
  }

  const funnel24h = await loadFunnel(since24h);
  const funnel7d = await loadFunnel(since7d);

  // --- Compose email ---
  const totalMrr = (slateMrr + freelanceMrr).toFixed(2);
  const totalSubs = slateSubs + freelanceSubs;
  const totalSignups24h = slate24h + free24h;

  const subject = `[SDub Daily] MRR $${totalMrr} · ${totalSubs} subs · ${totalSignups24h} new signups`;

  const pastDueBlock = () => {
    const rows: string[] = [];
    for (const o of slatePastDue) rows.push(`  Slate:     ${o.name || o.id}`);
    for (const p of freelancePastDue) rows.push(`  Freelance: ${p.display_name || p.email || p.id}`);
    if (rows.length === 0) return "  (none)";
    return rows.join("\n");
  };

  const body = `
Daily roll-up.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MRR (current state)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Slate:     $${slateMrr.toFixed(2)}  (${slateSubs} active)
  Freelance: $${freelanceMrr.toFixed(2)}  (${freelanceSubs} active)
  Total:     $${totalMrr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Signups
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Slate      — 24h: ${slate24h} · 7d: ${slate7d} (${deltaFmt(slate7d, slatePrior7d)} vs prior 7d)
  Freelance  — 24h: ${free24h} · 7d: ${free7d} (${deltaFmt(free7d, freePrior7d)} vs prior 7d)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Conversion funnel (viewed → started → completed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Slate      24h — ${funnel24h.slate.viewed} → ${stepFmt(funnel24h.slate.viewed, funnel24h.slate.started)} → ${stepFmt(funnel24h.slate.started, funnel24h.slate.completed)}
  Slate       7d — ${funnel7d.slate.viewed} → ${stepFmt(funnel7d.slate.viewed, funnel7d.slate.started)} → ${stepFmt(funnel7d.slate.started, funnel7d.slate.completed)}
  Freelance  24h — ${funnel24h.freelance.viewed} → ${stepFmt(funnel24h.freelance.viewed, funnel24h.freelance.started)} → ${stepFmt(funnel24h.freelance.started, funnel24h.freelance.completed)}
  Freelance   7d — ${funnel7d.freelance.viewed} → ${stepFmt(funnel7d.freelance.viewed, funnel7d.freelance.started)} → ${stepFmt(funnel7d.freelance.started, funnel7d.freelance.completed)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Past due
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${pastDueBlock()}

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
    console.error(`[daily-summary] failed: ${err?.message}`);
    return res.status(500).json({ error: err?.message });
  }
}
