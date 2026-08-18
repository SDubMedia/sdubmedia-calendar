// ============================================================
// Daily cron — stale lead nudges + follow-ups due
//
// Two jobs, one morning email per org:
//
// 1. STALE LEADS — pipeline leads sitting in an early stage (inquiry /
//    follow_up) that haven't been touched in STALE_DAYS days, so nothing
//    goes cold unnoticed. Speed to lead is the whole game.
//    Idempotency: each nudged lead gets `followup_nudged_at` stamped. A lead
//    is only nudged when followup_nudged_at is null or older than its
//    updated_at — so each "stale period" produces exactly one nudge, and the
//    moment the owner touches the lead (updated_at moves forward) it re-arms
//    for a future nudge if it goes quiet again. Reruns within a day are
//    no-ops because the stamp lands after updated_at.
//
// 2. FOLLOW-UPS DUE — leads whose owner-set follow_up_date is today or past.
//    These also get a bell notification per lead so they surface in-app.
//    Idempotency: `followup_due_notified_at` — a SEPARATE stamp, because
//    followup_nudged_at is load-bearing for the stale re-arm logic above.
//    Fires at most once per set date: the client NULLs the stamp whenever
//    follow_up_date changes (AppContext.updatePipelineLead), which re-arms it.
//    Stamped only when something was delivered (email or bell), so a total
//    failure retries tomorrow.
//
// Timezone: this runs at 15:00 UTC (vercel.json), when the UTC calendar date
// equals the US-local date — so comparing follow_up_date against the UTC
// today-string is correct for this deployment.
//
// Schedule: registered in vercel.json (15:00 UTC). Auth: Bearer CRON_SECRET.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
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

const LEAD_COLUMNS = "id, org_id, name, email, phone, project_type, pipeline_stage, updated_at, followup_nudged_at, created_at, follow_up_date, follow_up_note, followup_due_notified_at, closed_outcome";

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
  follow_up_date: string | null;
  follow_up_note: string;
  followup_due_notified_at: string | null;
  closed_outcome: string;
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
  const todayIso = now.toISOString().slice(0, 10);

  // Pull early-stage OPEN leads untouched since the cutoff. The followup vs
  // updated_at comparison is done in code (PostgREST can't compare two
  // columns inline). Closed (won/lost) leads have nothing to chase.
  const { data: leads, error } = await supabase
    .from("pipeline_leads")
    .select(LEAD_COLUMNS)
    .in("pipeline_stage", EARLY_STAGES)
    .is("deleted_at", null)
    .eq("closed_outcome", "")
    .lte("updated_at", cutoffIso);
  if (error) {
    console.error(`[lead-followup] supabase: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }

  // Keep only leads that haven't been nudged for the current stale period.
  const due = ((leads as LeadRow[] | null) ?? []).filter(
    l => !l.followup_nudged_at || l.followup_nudged_at < l.updated_at,
  );

  // Open leads with an owner-set follow-up date that has arrived — any stage.
  const { data: dueFollowUpRows, error: dueErr } = await supabase
    .from("pipeline_leads")
    .select(LEAD_COLUMNS)
    .is("deleted_at", null)
    .eq("closed_outcome", "")
    .not("follow_up_date", "is", null)
    .lte("follow_up_date", todayIso)
    .is("followup_due_notified_at", null);
  if (dueErr) {
    console.error(`[lead-followup] supabase (due follow-ups): ${dueErr.message}`);
    return res.status(500).json({ error: dueErr.message });
  }
  const dueFollowUps = (dueFollowUpRows as LeadRow[] | null) ?? [];

  // Group by org so each owner gets a single digest covering both sections.
  const byOrg = new Map<string, { stale: LeadRow[]; followUps: LeadRow[] }>();
  const groupFor = (orgId: string) => {
    const g = byOrg.get(orgId) ?? { stale: [], followUps: [] };
    byOrg.set(orgId, g);
    return g;
  };
  for (const l of due) groupFor(l.org_id).stale.push(l);
  for (const l of dueFollowUps) groupFor(l.org_id).followUps.push(l);

  let sent = 0;
  let skipped = 0;
  const nudgedIds: string[] = [];
  const dueNotifiedIds: string[] = [];
  let bells = 0;
  const errors: string[] = [];

  for (const [orgId, group] of byOrg) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, business_info")
      .eq("id", orgId)
      .single<OrgRow>();
    if (!org) { skipped += group.stale.length + group.followUps.length; continue; }
    const to = org.business_info?.email?.trim();

    // Email digest (both sections, whichever have rows).
    let emailOk = false;
    if (to) {
      try {
        await resend.emails.send({
          from: `${org.name || "Slate"} <${VERIFIED_FROM_EMAIL}>`,
          to,
          subject: digestSubject(group),
          html: renderDigest(org, group, now),
          replyTo: to,
        });
        sent++;
        emailOk = true;
        for (const l of group.stale) nudgedIds.push(l.id);
      } catch (err) {
        errors.push(`org=${orgId} email=${errorMessage(err)}`);
      }
    } else {
      // No owner email — the stale nudge waits for one, but a due follow-up
      // can still land as a bell below.
      skipped += group.stale.length;
    }

    // Bell notification per due follow-up, to every owner login in the org.
    let bellOk = false;
    if (group.followUps.length > 0) {
      const { data: owners } = await supabase
        .from("user_profiles").select("id").eq("org_id", orgId).eq("role", "owner");
      const rows = (owners ?? []).flatMap(o => group.followUps.map(l => ({
        id: randomUUID(),
        user_id: o.id,
        type: "lead_followup",
        title: `Follow-up due: ${l.name}`,
        message: l.follow_up_note || l.project_type || "Pipeline lead",
        link: "/pipeline",
      })));
      if (rows.length > 0) {
        const { error: bellErr } = await supabase.from("notifications").insert(rows);
        if (bellErr) errors.push(`org=${orgId} bell=${bellErr.message}`);
        else { bellOk = true; bells += rows.length; }
      }
      // Stamp only when something was delivered; a total failure retries
      // tomorrow because the stamp stays NULL.
      if (emailOk || bellOk) for (const l of group.followUps) dueNotifiedIds.push(l.id);
    }
  }

  // Stamp everything successfully delivered (two bulk updates, two stamps —
  // followup_nudged_at re-arms on updated_at, followup_due_notified_at
  // re-arms when the client changes follow_up_date).
  if (nudgedIds.length > 0) {
    const { error: updErr } = await supabase
      .from("pipeline_leads")
      .update({ followup_nudged_at: now.toISOString() })
      .in("id", nudgedIds);
    if (updErr) errors.push(`stamp update=${updErr.message}`);
  }
  if (dueNotifiedIds.length > 0) {
    const { error: updErr } = await supabase
      .from("pipeline_leads")
      .update({ followup_due_notified_at: now.toISOString() })
      .in("id", dueNotifiedIds);
    if (updErr) errors.push(`due stamp update=${updErr.message}`);
  }

  if (CRONITOR_TELEMETRY_KEY) {
    const state = errors.length === 0 ? "complete" : "fail";
    try { await fetch(`https://cronitor.link/p/${CRONITOR_TELEMETRY_KEY}/${CRONITOR_MONITOR}?state=${state}&metric=count:${sent}`); }
    catch { /* best-effort */ }
  }

  if (errors.length > 0) {
    sendOpsAlert(
      `Lead follow-up cron had ${errors.length} error${errors.length === 1 ? "" : "s"}`,
      `Digests sent: ${sent}\nLeads nudged: ${nudgedIds.length}\nFollow-ups notified: ${dueNotifiedIds.length}\nBells: ${bells}\nSkipped (no owner email): ${skipped}\nErrors:\n${errors.join("\n")}`,
    ).catch(() => {});
  }

  return res.status(200).json({ ok: true, sent, nudged: nudgedIds.length, followupsDue: dueNotifiedIds.length, bells, skipped, errors });
}

// ---- helpers ----

function daysStale(updatedIso: string, now: Date): number {
  const updated = new Date(updatedIso);
  return Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86_400_000));
}

/** Days a follow-up date (YYYY-MM-DD) is past, measured against UTC today. */
function daysPast(dateIso: string, now: Date): number {
  const due = Date.parse(`${dateIso}T00:00:00Z`);
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((today - due) / 86_400_000));
}

function stageLabel(stage: string): string {
  return stage === "follow_up" ? "Follow-up" : "Inquiry";
}

function digestSubject(group: { stale: LeadRow[]; followUps: LeadRow[] }): string {
  const f = group.followUps.length;
  const s = group.stale.length;
  if (f > 0 && s > 0) return `${f} follow-up${f === 1 ? "" : "s"} due · ${s} lead${s === 1 ? "" : "s"} gone quiet`;
  if (f > 0) return f === 1 ? `Follow-up due today: ${group.followUps[0].name}` : `${f} follow-ups due today`;
  return s === 1 ? `A lead has gone quiet: ${group.stale[0].name}` : `${s} leads have gone quiet`;
}

function renderDigest(org: OrgRow, group: { stale: LeadRow[]; followUps: LeadRow[] }, now: Date): string {
  const pipelineUrl = `${APP_BASE}/pipeline`;

  const followUpRows = group.followUps
    .map(l => {
      const past = l.follow_up_date ? daysPast(l.follow_up_date, now) : 0;
      const contact = [l.email, l.phone].filter(Boolean).map(escapeHtml).join(" · ");
      return `<tr>
        <td style="padding:8px 12px;border-top:1px solid #e2e8f0;">
          <div style="font-weight:600;">${escapeHtml(l.name)}</div>
          ${l.follow_up_note ? `<div style="color:#64748b;font-size:13px;">${escapeHtml(l.follow_up_note)}</div>` : `<div style="color:#64748b;font-size:13px;">${escapeHtml(l.project_type || "Pipeline lead")}</div>`}
          ${contact ? `<div style="color:#94a3b8;font-size:12px;">${contact}</div>` : ""}
        </td>
        <td style="padding:8px 12px;border-top:1px solid #e2e8f0;text-align:right;white-space:nowrap;color:${past > 0 ? "#dc2626" : "#b45309"};font-size:13px;">
          ${past > 0 ? `${past} day${past === 1 ? "" : "s"} overdue` : "due today"}
        </td>
      </tr>`;
    })
    .join("");

  const staleRows = group.stale
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

  const followUpSection = group.followUps.length > 0 ? `
    <h2 style="margin:0 0 4px;font-size:18px;">Follow-ups due</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">You asked to be reminded about ${group.followUps.length === 1 ? "this lead" : "these leads"} today.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">${followUpRows}</table>` : "";

  const staleSection = group.stale.length > 0 ? `
    <h2 style="margin:${group.followUps.length > 0 ? "24px" : "0"} 0 4px;font-size:18px;">Leads that have gone quiet</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">${group.stale.length === 1
      ? "One of your leads hasn't been touched in a few days. A quick follow-up now keeps it warm."
      : "These leads haven't been touched in a few days. A quick follow-up now keeps them warm."}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">${staleRows}</table>` : "";

  const body = `
    ${followUpSection}
    ${staleSection}
    <p style="margin:24px 0;">
      <a href="${escapeHtml(pipelineUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Open your pipeline</a>
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">Follow-up reminders fire once per date you set; leads in an early stage are also nudged when they go quiet. Update or move a lead and it re-arms.</p>`;

  return brandedEmailWrapper({ orgName: org.name, businessInfo: org.business_info }, body);
}
