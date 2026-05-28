// ============================================================
// Daily cron — stale lead follow-up nudges
//
// Finds pipeline leads sitting in an early stage (inquiry / follow_up)
// that haven't been touched in STALE_DAYS days, and emails the owner one
// digest per org listing them, so nothing goes cold unnoticed. Speed to
// lead is the whole game.
//
// Idempotency: each nudged lead gets `followup_nudged_at` stamped. A lead
// is only nudged when followup_nudged_at is null or older than its
// updated_at — so each "stale period" produces exactly one nudge, and the
// moment the owner touches the lead (updated_at moves forward) it re-arms
// for a future nudge if it goes quiet again. Reruns within a day are
// no-ops because the stamp lands after updated_at.
//
// Schedule: registered in vercel.json (15:00 UTC). Auth: Bearer CRON_SECRET.
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
const CRONITOR_MONITOR = "slate-lead-followup";

// Stages we chase. Defaults; orgs with custom stage ids that keep these
// keys still match. A lead untouched this many days triggers a nudge.
const EARLY_STAGES = ["inquiry", "follow_up"];
const STALE_DAYS = 3;

interface LeadRow {
  id: string;
  org_id: string;
  name: string;
  email: string;
  phone: string;
  project_type: string;
  pipeline_stage: string;
  updated_at: string;
  followup_nudged_at: string | null;
  created_at: string;
}

interface OrgRow {
  id: string;
  name: string;
  business_info: { email?: string } | null;
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
  const now = new Date();
  const cutoffIso = new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString();

  // Pull early-stage leads untouched since the cutoff. The followup vs
  // updated_at comparison is done in code (PostgREST can't compare two
  // columns inline).
  const { data: leads, error } = await supabase
    .from("pipeline_leads")
    .select("id, org_id, name, email, phone, project_type, pipeline_stage, updated_at, followup_nudged_at, created_at")
    .in("pipeline_stage", EARLY_STAGES)
    .is("deleted_at", null)
    .lte("updated_at", cutoffIso);
  if (error) {
    console.error(`[lead-followup] supabase: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }

  // Keep only leads that haven't been nudged for the current stale period.
  const due = ((leads as LeadRow[] | null) ?? []).filter(
    l => !l.followup_nudged_at || l.followup_nudged_at < l.updated_at,
  );

  // Group by org so each owner gets a single digest.
  const byOrg = new Map<string, LeadRow[]>();
  for (const l of due) {
    const arr = byOrg.get(l.org_id) ?? [];
    arr.push(l);
    byOrg.set(l.org_id, arr);
  }

  let sent = 0;
  let skipped = 0;
  const nudgedIds: string[] = [];
  const errors: string[] = [];

  for (const [orgId, orgLeads] of byOrg) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, business_info")
      .eq("id", orgId)
      .single<OrgRow>();
    const to = org?.business_info?.email?.trim();
    if (!org || !to) { skipped += orgLeads.length; continue; } // no owner email — try again once it's set

    try {
      await resend.emails.send({
        from: `${org.name || "Slate"} <${VERIFIED_FROM_EMAIL}>`,
        to,
        subject: orgLeads.length === 1
          ? `A lead has gone quiet: ${orgLeads[0].name}`
          : `${orgLeads.length} leads have gone quiet`,
        html: renderDigest(org, orgLeads, now),
        replyTo: to,
      });
      sent++;
      for (const l of orgLeads) nudgedIds.push(l.id);
    } catch (err) {
      errors.push(`org=${orgId} err=${errorMessage(err)}`);
    }
  }

  // Stamp everything we successfully nudged (single update).
  if (nudgedIds.length > 0) {
    const { error: updErr } = await supabase
      .from("pipeline_leads")
      .update({ followup_nudged_at: now.toISOString() })
      .in("id", nudgedIds);
    if (updErr) errors.push(`stamp update=${updErr.message}`);
  }

  if (CRONITOR_TELEMETRY_KEY) {
    const state = errors.length === 0 ? "complete" : "fail";
    try { await fetch(`https://cronitor.link/p/${CRONITOR_TELEMETRY_KEY}/${CRONITOR_MONITOR}?state=${state}&metric=count:${sent}`); }
    catch { /* best-effort */ }
  }

  if (errors.length > 0) {
    sendOpsAlert(
      `Lead follow-up cron had ${errors.length} error${errors.length === 1 ? "" : "s"}`,
      `Digests sent: ${sent}\nLeads nudged: ${nudgedIds.length}\nSkipped (no owner email): ${skipped}\nErrors:\n${errors.join("\n")}`,
    ).catch(() => {});
  }

  return res.status(200).json({ ok: true, sent, nudged: nudgedIds.length, skipped, errors });
}

// ---- helpers ----

function daysStale(updatedIso: string, now: Date): number {
  const updated = new Date(updatedIso);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86_400_000));
}

function stageLabel(stage: string): string {
  return stage === "follow_up" ? "Follow-up" : "Inquiry";
}

function renderDigest(org: OrgRow, leads: LeadRow[], now: Date): string {
  const pipelineUrl = `${APP_BASE}/pipeline`;
  const rows = leads
    .map(l => {
      const days = daysStale(l.updated_at, now);
      const contact = [l.email, l.phone].filter(Boolean).map(escapeHtml).join(" · ");
      return `<tr>
        <td style="padding:8px 12px;border-top:1px solid #e2e8f0;">
          <div style="font-weight:600;">${escapeHtml(l.name)}</div>
          <div style="color:#64748b;font-size:13px;">${escapeHtml(l.project_type || "Inquiry")} · ${escapeHtml(stageLabel(l.pipeline_stage))}</div>
          ${contact ? `<div style="color:#94a3b8;font-size:12px;">${contact}</div>` : ""}
        </td>
        <td style="padding:8px 12px;border-top:1px solid #e2e8f0;text-align:right;white-space:nowrap;color:#b45309;font-size:13px;">
          quiet ${days} day${days === 1 ? "" : "s"}
        </td>
      </tr>`;
    })
    .join("");

  const intro = leads.length === 1
    ? "One of your leads hasn't been touched in a few days. A quick follow-up now keeps it warm."
    : `These leads haven't been touched in a few days. A quick follow-up now keeps them warm.`;

  const body = `
    <h2 style="margin:0 0 4px;font-size:18px;">Leads that have gone quiet</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">${intro}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">${rows}</table>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(pipelineUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Open your pipeline</a>
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">You're getting this because these leads are in an early stage. Update or move a lead and it won't show up here again unless it goes quiet later.</p>`;

  return brandedEmailWrapper({ orgName: org.name, businessInfo: org.business_info }, body);
}
