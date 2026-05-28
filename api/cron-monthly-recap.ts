// ============================================================
// Monthly cron — per-org recap email
//
// On the 1st of each month, emails each org owner a short recap of the
// month just ended: jobs completed, revenue collected, and new leads.
// It's a value reminder ("here's what Slate helped you do") that lands
// right around renewal time, which fights churn.
//
// Only orgs with a business email on file and at least one number worth
// reporting get an email — no "you did nothing" messages, and the many
// empty test orgs (no email set) are skipped naturally.
//
// Idempotency: each org's recap month is stamped on
// business_info.lastRecapMonth ("YYYY-MM"); a rerun in the same month is
// a no-op. Mileage is intentionally excluded — accurate miles need the
// app's distance-matrix logic, and a wrong number would undercut trust.
//
// Schedule: registered in vercel.json (14:00 UTC on the 1st).
// Auth: Bearer CRON_SECRET.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { errorMessage, escapeHtml } from "./_auth.js";
import { sendOpsAlert } from "./_opsAlert.js";
import { brandedEmailWrapper } from "./_emailBranding.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
const resend = new Resend(process.env.RESEND_API_KEY);

const VERIFIED_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@slate.sdubmedia.com";
const APP_BASE = process.env.PUBLIC_APP_URL || "https://slate.sdubmedia.com";
const CRONITOR_TELEMETRY_KEY = process.env.CRONITOR_TELEMETRY_KEY || "";
const CRONITOR_MONITOR = "slate-monthly-recap";

interface OrgRow {
  id: string;
  name: string;
  business_info: { email?: string; lastRecapMonth?: string } | null;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  if (CRONITOR_TELEMETRY_KEY) {
    try { await fetch(`https://cronitor.link/p/${CRONITOR_TELEMETRY_KEY}/${CRONITOR_MONITOR}?state=run`); }
    catch { /* best-effort */ }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Previous calendar month window (UTC).
  const now = new Date();
  const firstThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firstPrevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const startYmd = ymd(firstPrevMonth);
  const endYmd = ymd(firstThisMonth);
  const startIso = firstPrevMonth.toISOString();
  const endIso = firstThisMonth.toISOString();
  const monthLabel = firstPrevMonth.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthKey = `${firstPrevMonth.getUTCFullYear()}-${String(firstPrevMonth.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, business_info");
  if (error) {
    console.error(`[monthly-recap] supabase: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const org of (orgs as OrgRow[] | null) ?? []) {
    const to = org.business_info?.email?.trim();
    if (!to) { skipped++; continue; }                                   // no owner email
    if (org.business_info?.lastRecapMonth === monthKey) { skipped++; continue; } // already sent

    try {
      // Jobs completed: projects dated in the month, excluding cancelled.
      const { count: jobsCount } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .gte("date", startYmd)
        .lt("date", endYmd);

      // Revenue collected: invoices paid in the month.
      const { data: paidInvoices } = await supabase
        .from("invoices")
        .select("total")
        .eq("org_id", org.id)
        .is("deleted_at", null)
        .not("paid_date", "is", null)
        .gte("paid_date", startYmd)
        .lt("paid_date", endYmd);
      const revenue = (paidInvoices ?? []).reduce((s, r) => s + (Number((r as { total?: number }).total) || 0), 0);

      // New leads captured in the month.
      const { count: leadsCount } = await supabase
        .from("pipeline_leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id)
        .is("deleted_at", null)
        .gte("created_at", startIso)
        .lt("created_at", endIso);

      const jobs = jobsCount || 0;
      const leads = leadsCount || 0;

      // Nothing worth reporting — skip (and don't stamp, so a late-arriving
      // paid invoice could still surface next run... but month is closed, so
      // stamp anyway to avoid rechecking a dead month every retry).
      if (jobs === 0 && revenue === 0 && leads === 0) {
        await stampRecapMonth(supabase, org, monthKey);
        skipped++;
        continue;
      }

      await resend.emails.send({
        from: `${org.name || "Slate"} <${VERIFIED_FROM_EMAIL}>`,
        to,
        subject: `Your ${monthLabel} recap`,
        html: renderRecap(org, monthLabel, { jobs, revenue, leads }),
        replyTo: to,
      });
      await stampRecapMonth(supabase, org, monthKey);
      sent++;
    } catch (err) {
      errors.push(`org=${org.id} err=${errorMessage(err)}`);
    }
  }

  if (CRONITOR_TELEMETRY_KEY) {
    const state = errors.length === 0 ? "complete" : "fail";
    try { await fetch(`https://cronitor.link/p/${CRONITOR_TELEMETRY_KEY}/${CRONITOR_MONITOR}?state=${state}&metric=count:${sent}`); }
    catch { /* best-effort */ }
  }

  if (errors.length > 0) {
    sendOpsAlert(
      `Monthly recap cron had ${errors.length} error${errors.length === 1 ? "" : "s"}`,
      `Month: ${monthLabel}\nSent: ${sent}\nSkipped: ${skipped}\nErrors:\n${errors.join("\n")}`,
    ).catch(() => {});
  }

  return res.status(200).json({ ok: true, month: monthKey, sent, skipped, errors });
}

// ---- helpers ----

async function stampRecapMonth(
  supabase: ReturnType<typeof createClient>,
  org: OrgRow,
  monthKey: string,
): Promise<void> {
  const merged = { ...(org.business_info || {}), lastRecapMonth: monthKey };
  await supabase.from("organizations").update({ business_info: merged }).eq("id", org.id);
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function renderRecap(
  org: OrgRow,
  monthLabel: string,
  stats: { jobs: number; revenue: number; leads: number },
): string {
  const dashUrl = `${APP_BASE}/dashboard`;
  const stat = (value: string, label: string) => `
    <td style="padding:16px;text-align:center;background:#f8fafc;border-radius:10px;">
      <div style="font-size:26px;font-weight:700;color:#0f172a;">${escapeHtml(value)}</div>
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-top:4px;">${escapeHtml(label)}</div>
    </td>`;

  const cells: string[] = [];
  cells.push(stat(String(stats.jobs), stats.jobs === 1 ? "Job done" : "Jobs done"));
  if (stats.revenue > 0) cells.push(stat(money(stats.revenue), "Collected"));
  if (stats.leads > 0) cells.push(stat(String(stats.leads), stats.leads === 1 ? "New lead" : "New leads"));

  const row = cells.map((c, i) => (i > 0 ? `<td style="width:12px;"></td>${c}` : c)).join("");

  const body = `
    <h2 style="margin:0 0 4px;font-size:20px;">Your ${escapeHtml(monthLabel)} recap</h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">Here's what you got done last month.</p>
    <table style="border-collapse:separate;border-spacing:0;width:100%;"><tr>${row}</tr></table>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(dashUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Open your dashboard</a>
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">Sent once a month. Keep up the great work.</p>`;

  return brandedEmailWrapper({ orgName: org.name, businessInfo: org.business_info }, body);
}
