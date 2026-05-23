// ============================================================
// Vercel Serverless Function — iCal Feed for Slate Calendar
// Subscribe from any calendar app (PocketLife, Google, Apple)
// URL: /api/calendar.ics?key=<API_KEY>&type=all|production|personal
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatICalDate(date: string, time?: string): string {
  const d = date.replace(/-/g, "");
  if (time) {
    const t = time.replace(/:/g, "") + "00";
    return `${d}T${t}`;
  }
  return d;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth via query param (calendar apps can't send headers)
  const key = req.query.key as string;
  if (!key) return res.status(401).send("Unauthorized");

  const db = createClient(supabaseUrl, supabaseKey);

  // Resolve which org's data to show
  let callerOrgId: string;
  if (key === process.env.SLATE_API_KEY) {
    // Platform key — use first org (single-tenant) or require orgId param
    const { data: firstOrg } = await db.from("organizations").select("id").limit(1).single();
    if (!firstOrg) return res.status(404).send("No organization found");
    callerOrgId = firstOrg.id;
  } else {
    // Org-id key — verify it exists and use it to scope data
    const { data: org } = await db.from("organizations").select("id").eq("id", key).single();
    if (!org) return res.status(401).send("Unauthorized");
    callerOrgId = org.id;
  }

  const calType = (req.query.type as string) || "all";

  // Minimal row shapes for the .ics builder — enough for the fields we read.
  type ProjectRow = { id: string; client_id: string; project_type_id: string; location_id: string; date: string; start_time: string | null; end_time: string | null; notes: string | null };
  type PersonalEventRow = { id: string; title: string; date: string; start_time: string | null; end_time: string | null; notes: string | null };
  type ClientRow = { id: string; company: string };
  type TypeRow = { id: string; name: string };
  type LocationRow = { id: string; name: string; address: string; city: string; state: string };

  // Fetch projects — scoped to org
  let projects: ProjectRow[] = [];
  if (calType === "all" || calType === "production") {
    const { data } = await db.from("projects").select("*").eq("org_id", callerOrgId).neq("status", "deleted").order("date");
    projects = (data as ProjectRow[]) || [];
  }

  // Fetch personal events — scoped to org
  let personalEvents: PersonalEventRow[] = [];
  if (calType === "all" || calType === "personal") {
    const { data } = await db.from("personal_events").select("*").eq("org_id", callerOrgId).order("date");
    personalEvents = (data as PersonalEventRow[]) || [];
  }

  // Fetch reference data for project names — scoped to org
  const { data: clientsRaw } = await db.from("clients").select("id, company").eq("org_id", callerOrgId);
  const { data: typesRaw } = await db.from("project_types").select("id, name").eq("org_id", callerOrgId);
  const { data: locsRaw } = await db.from("locations").select("id, name, address, city, state").eq("org_id", callerOrgId);
  const clients = Object.fromEntries(((clientsRaw as ClientRow[]) || []).map(c => [c.id, c.company]));
  const types = Object.fromEntries(((typesRaw as TypeRow[]) || []).map(t => [t.id, t.name]));
  const locs = Object.fromEntries(((locsRaw as LocationRow[]) || []).map(l => [l.id, { name: l.name, address: `${l.address}, ${l.city}, ${l.state}` }]));

  // Build iCal
  const events: string[] = [];

  for (const p of projects) {
    const typeName = types[p.project_type_id] || "Project";
    const clientName = clients[p.client_id] || "";
    const loc = locs[p.location_id];
    const summary = clientName ? `${typeName} - ${clientName}` : typeName;

    let vevent = `BEGIN:VEVENT
UID:slate-${p.id}@sdubmedia.com
DTSTAMP:${formatICalDate(new Date().toISOString().slice(0, 10), "000000")}
SUMMARY:${esc(summary)}`;

    if (p.start_time && p.end_time) {
      vevent += `\nDTSTART:${formatICalDate(p.date, p.start_time)}`;
      vevent += `\nDTEND:${formatICalDate(p.date, p.end_time)}`;
    } else {
      vevent += `\nDTSTART;VALUE=DATE:${formatICalDate(p.date)}`;
    }

    if (loc) {
      vevent += `\nLOCATION:${esc(loc.name + " - " + loc.address)}`;
    }

    if (p.notes) {
      vevent += `\nDESCRIPTION:${esc(p.notes)}`;
    }

    const statusMap: Record<string, string> = {
      upcoming: "CONFIRMED",
      filming_done: "CONFIRMED",
      in_editing: "CONFIRMED",
      completed: "CONFIRMED",
    };
    vevent += `\nSTATUS:${statusMap[p.status] || "CONFIRMED"}`;
    vevent += `\nCATEGORIES:Production`;
    vevent += `\nEND:VEVENT`;
    events.push(vevent);
  }

  for (const e of personalEvents) {
    let vevent = `BEGIN:VEVENT
UID:slate-personal-${e.id}@sdubmedia.com
DTSTAMP:${formatICalDate(new Date().toISOString().slice(0, 10), "000000")}
SUMMARY:${esc(e.title || "Event")}`;

    if (e.start_time && e.end_time) {
      vevent += `\nDTSTART:${formatICalDate(e.date, e.start_time)}`;
      vevent += `\nDTEND:${formatICalDate(e.date, e.end_time)}`;
    } else if (e.all_day) {
      vevent += `\nDTSTART;VALUE=DATE:${formatICalDate(e.date)}`;
    } else {
      vevent += `\nDTSTART;VALUE=DATE:${formatICalDate(e.date)}`;
    }

    if (e.location) vevent += `\nLOCATION:${esc(e.location)}`;
    if (e.notes) vevent += `\nDESCRIPTION:${esc(e.notes)}`;
    vevent += `\nCATEGORIES:Personal`;
    vevent += `\nEND:VEVENT`;
    events.push(vevent);
  }

  const ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SDub Media//Slate Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Slate Calendar
X-WR-TIMEZONE:America/Chicago
${events.join("\n")}
END:VCALENDAR`;

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "inline; filename=slate.ics");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.status(200).send(ical);
}
