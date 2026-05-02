// ============================================================
// Daily cron — event reminders to clients about upcoming projects.
//
// Fires for projects whose date is exactly 7 days away, 1 day away, or
// today. Skips cancelled projects, completed projects, and projects
// where the client has no email on file. Tracks last_event_reminder_sent_at
// per project so reruns within a single day don't double-send.
//
// Schedule: registered in vercel.json (15:00 UTC / 10am ET).
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
const FALLBACK_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Geoff@SdubMedia.com";
const CRONITOR_TELEMETRY_KEY = process.env.CRONITOR_TELEMETRY_KEY || "";
const CRONITOR_MONITOR = "slate-event-reminders";

// Days-until-event windows. Single fire per window per project.
const REMINDER_OFFSETS = [7, 1, 0] as const;

interface ProjectRow {
  id: string;
  org_id: string;
  client_id: string;
  date: string;            // ISO YYYY-MM-DD
  start_time: string;
  end_time: string;
  status: string;
  location_id: string | null;
  last_event_reminder_sent_at: string | null;
  project_type_id: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  if (CRONITOR_TELEMETRY_KEY) {
    try { await fetch(`https://cronitor.link/p/${CRONITOR_TELEMETRY_KEY}/${CRONITOR_MONITOR}?state=run`); } catch { /* best-effort */ }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  // Fetch upcoming projects within the reminder window. Filter range
  // server-side for efficiency: today through today+7 days. Anything
  // outside that range can't match REMINDER_OFFSETS.
  const sevenDaysOut = new Date(today); sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const sevenDaysOutIso = sevenDaysOut.toISOString().slice(0, 10);

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, org_id, client_id, date, start_time, end_time, status, location_id, last_event_reminder_sent_at, project_type_id")
    .gte("date", todayIso)
    .lte("date", sevenDaysOutIso)
    .neq("status", "cancelled")
    .neq("status", "completed");
  if (error) {
    console.error(`[event-reminders] supabase: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of (projects as ProjectRow[] | null) ?? []) {
    const daysUntilEvent = daysBetween(todayIso, p.date);
    if (!REMINDER_OFFSETS.includes(daysUntilEvent as typeof REMINDER_OFFSETS[number])) {
      skipped++; continue;
    }

    // Idempotency: skip if a reminder already went out today.
    if (p.last_event_reminder_sent_at && p.last_event_reminder_sent_at.slice(0, 10) === todayIso) {
      skipped++; continue;
    }

    // Resolve client email + name.
    const { data: client } = await supabase
      .from("clients")
      .select("email, contact_name, company")
      .eq("id", p.client_id)
      .single();
    if (!client?.email) { skipped++; continue; }

    // Resolve org branding for from-line.
    const { data: org } = await supabase
      .from("organizations")
      .select("name, business_info")
      .eq("id", p.org_id)
      .single();
    if (!org) { skipped++; continue; }
    const businessInfo = (org.business_info as { email?: string } | null) || {};
    const orgEmail = businessInfo.email?.trim() || FALLBACK_FROM_EMAIL;

    // Resolve location + project type.
    let locationName = "";
    if (p.location_id) {
      const { data: loc } = await supabase.from("locations").select("name").eq("id", p.location_id).single();
      locationName = loc?.name || "";
    }
    let projectTypeName = "Project";
    if (p.project_type_id) {
      const { data: pt } = await supabase.from("project_types").select("name").eq("id", p.project_type_id).single();
      projectTypeName = pt?.name || projectTypeName;
    }

    try {
      const html = renderEventReminderEmail({
        clientName: client.contact_name || client.company || "",
        orgName: org.name || "",
        businessInfo: org.business_info,
        projectType: projectTypeName,
        date: p.date,
        startTime: p.start_time,
        endTime: p.end_time,
        location: locationName,
        daysUntilEvent,
      });
      const subject = daysUntilEvent === 7
        ? `Heads up: Your ${projectTypeName.toLowerCase()} is one week away`
        : daysUntilEvent === 1
          ? `Reminder: Your ${projectTypeName.toLowerCase()} is tomorrow`
          : `Today's the day! Your ${projectTypeName.toLowerCase()}`;
      await resend.emails.send({
        from: `${org.name || "Your contractor"} <${orgEmail}>`,
        to: client.email,
        subject,
        html,
        replyTo: orgEmail,
      });
      await supabase
        .from("projects")
        .update({ last_event_reminder_sent_at: new Date().toISOString() })
        .eq("id", p.id);
      sent++;
    } catch (err) {
      errors.push(`project=${p.id} err=${errorMessage(err)}`);
    }
  }

  if (CRONITOR_TELEMETRY_KEY) {
    const state = errors.length === 0 ? "complete" : "fail";
    try { await fetch(`https://cronitor.link/p/${CRONITOR_TELEMETRY_KEY}/${CRONITOR_MONITOR}?state=${state}&metric=count:${sent}`); } catch { /* best-effort */ }
  }

  if (errors.length > 0) {
    sendOpsAlert(
      `Event reminders cron had ${errors.length} error${errors.length === 1 ? "" : "s"}`,
      `Sent: ${sent}\nSkipped: ${skipped}\nErrors:\n${errors.join("\n")}`,
    ).catch(() => {});
  }

  return res.status(200).json({ ok: true, sent, skipped, errors });
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T00:00:00Z");
  const b = new Date(bIso + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function renderEventReminderEmail(input: {
  clientName: string;
  orgName: string;
  businessInfo: { email?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string; website?: string } | null;
  projectType: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  daysUntilEvent: number;
}): string {
  const dateLabel = formatHumanDate(input.date);
  const timeLabel = input.startTime && input.endTime
    ? `${input.startTime} – ${input.endTime}`
    : input.startTime || "";
  const headline = input.daysUntilEvent === 7
    ? "One week to go"
    : input.daysUntilEvent === 1
      ? "Tomorrow's the day"
      : "Today's the day!";
  const greeting = input.clientName.split(/\s+/)[0] || "there";
  const body = `
    <h2 style="margin:0 0 4px;font-size:18px;color:#059669;">${escapeHtml(headline)}</h2>
    <p style="margin:0 0 16px;font-size:14px;">Hi ${escapeHtml(greeting)},</p>
    <p style="margin:0 0 16px;font-size:14px;">Just a friendly reminder about your ${escapeHtml(input.projectType.toLowerCase())} ${input.daysUntilEvent === 0 ? "today" : input.daysUntilEvent === 1 ? "tomorrow" : `on ${dateLabel}`}:</p>
    <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;color:#64748b;">📅 Date</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(dateLabel)}</td></tr>
      ${timeLabel ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">🕐 Time</td><td style="padding:4px 0;">${escapeHtml(timeLabel)}</td></tr>` : ""}
      ${input.location ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">📍 Location</td><td style="padding:4px 0;">${escapeHtml(input.location)}</td></tr>` : ""}
    </table>
    <p style="margin:16px 0 0;font-size:14px;">If anything changes or you have questions, just reply to this email.</p>`;
  return brandedEmailWrapper({ orgName: input.orgName, businessInfo: input.businessInfo }, body);
}

function formatHumanDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
