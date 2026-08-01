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

// All-day events use an EXCLUSIVE end date (the day after), per RFC 5545.
// Emitting DTEND is what stops Apple/Google from rendering the event blank.
function nextDayDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// Who a personal feed belongs to. null = the owner's org-wide feed or the
// platform key, both of which see everything.
export type FeedViewer = { userId: string; role: string; crewMemberId: string; clientIds: string[] } | null;

/** Is this person named on the project's crew or post-production list? */
function namedOnProject(list: unknown, crewMemberId: string): boolean {
  if (!crewMemberId || !Array.isArray(list)) return false;
  return list.some(e => {
    const entry = e as Record<string, unknown> | null;
    const id = (entry?.crewMemberId ?? entry?.crew_member_id) as string | undefined;
    return id === crewMemberId;
  });
}

/** Does this project belong in the viewer's personal feed? Exported so the
 *  rule is testable — this is the line between "my jobs" and "everyone's". */
export function projectInFeed(
  project: { client_id?: string | null; crew?: unknown; post_production?: unknown },
  viewer: FeedViewer,
): boolean {
  if (!viewer) return true;
  if (viewer.role === "owner" || viewer.role === "partner" || viewer.role === "family") return true;
  if (viewer.role === "client") return !!project.client_id && viewer.clientIds.includes(project.client_id);
  if (viewer.role === "staff") {
    return namedOnProject(project.crew, viewer.crewMemberId)
      || namedOnProject(project.post_production, viewer.crewMemberId);
  }
  return false; // unknown role — deny rather than leak
}

/** Same question for meetings. Staff get only what they're assigned to; a
 *  client gets one only if it's tied to them AND flagged visible. */
export function meetingInFeed(
  meeting: { client_id?: string | null; assigned_user_ids?: unknown; visible_to_client?: boolean | null },
  viewer: FeedViewer,
): boolean {
  if (!viewer) return true;
  if (viewer.role === "owner" || viewer.role === "partner" || viewer.role === "family") return true;
  if (viewer.role === "staff") {
    return Array.isArray(meeting.assigned_user_ids) && meeting.assigned_user_ids.includes(viewer.userId);
  }
  if (viewer.role === "client") {
    return !!meeting.client_id && viewer.clientIds.includes(meeting.client_id) && meeting.visible_to_client === true;
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth via query param (calendar apps can't send headers)
  const key = req.query.key as string;
  if (!key) return res.status(401).send("Unauthorized");

  const db = createClient(supabaseUrl, supabaseKey);

  // Resolve which org's data to show, and — for a personal feed — whose view of
  // it. `viewer` stays null for the owner's org-wide feed and the platform key.
  let callerOrgId: string;
  let viewer: { userId: string; role: string; crewMemberId: string; clientIds: string[] } | null = null;
  if (key === process.env.SLATE_API_KEY) {
    // Platform key — use first org (single-tenant) or require orgId param
    const { data: firstOrg } = await db.from("organizations").select("id").limit(1).single();
    if (!firstOrg) return res.status(404).send("No organization found");
    callerOrgId = firstOrg.id;
  } else {
    // Org-feed token — resolve the org BY its secret feed token, NEVER by id.
    // (Looking up by id let anyone who knew an org id pull its whole calendar.)
    // The token lives in org_secrets, which only the owner can read; it used to
    // sit on organizations, where every member login could read it.
    const { data: secrets } = await db.from("org_secrets").select("org_id").eq("calendar_feed_token", key).maybeSingle();
    if (secrets) {
      callerOrgId = secrets.org_id;
    } else {
      // Otherwise it's someone's personal feed. Same URL shape, but the
      // contents get filtered to what that person is allowed to see below.
      const { data: userToken } = await db
        .from("user_feed_tokens").select("user_id, org_id").eq("token", key).maybeSingle();
      if (!userToken) return res.status(401).send("Unauthorized");
      const { data: prof } = await db
        .from("user_profiles").select("id, role, crew_member_id, client_ids, org_id")
        .eq("id", userToken.user_id).maybeSingle();
      if (!prof) return res.status(401).send("Unauthorized");
      callerOrgId = prof.org_id || userToken.org_id;
      viewer = {
        userId: prof.id,
        role: prof.role || "",
        crewMemberId: prof.crew_member_id || "",
        clientIds: Array.isArray(prof.client_ids) ? prof.client_ids : [],
      };
    }
  }

  const calType = (req.query.type as string) || "all";

  // Minimal row shapes for the .ics builder — enough for the fields we read.
  type ProjectRow = { id: string; client_id: string; project_type_id: string; location_id: string; date: string; start_time: string | null; end_time: string | null; notes: string | null; status: string; crew?: unknown; post_production?: unknown };
  type PersonalEventRow = { id: string; title: string; date: string; start_time: string | null; end_time: string | null; notes: string | null; location: string | null };
  type ClientRow = { id: string; company: string };
  type TypeRow = { id: string; name: string };
  type LocationRow = { id: string; name: string; address: string; city: string; state: string };
  type MeetingRow = { id: string; title: string; date: string; start_time: string | null; end_time: string | null; client_id: string | null; location_text: string | null; meeting_address: string | null; notes: string | null; assigned_user_ids?: string[] | null; visible_to_client?: boolean | null };

  // A personal feed only carries what that person can see in the app. This runs
  // under the service role, so RLS isn't doing the filtering here — these
  // checks are.
  // The shared personal calendar belongs to the owner and family — staff and
  // clients have no read access to it in the app, so it stays out of their feed.
  const seesPersonalEvents = !viewer || viewer.role === "owner" || viewer.role === "family";

  // Fetch projects — scoped to org, then to the person for a personal feed
  let projects: ProjectRow[] = [];
  if (calType === "all" || calType === "production") {
    const { data } = await db.from("projects").select("*").eq("org_id", callerOrgId).neq("status", "deleted").order("date");
    projects = ((data as ProjectRow[]) || []).filter(p => projectInFeed(p, viewer));
  }

  // Fetch personal events — the shared personal calendar, owner + family only
  let personalEvents: PersonalEventRow[] = [];
  if ((calType === "all" || calType === "personal") && seesPersonalEvents) {
    const { data } = await db.from("personal_events").select("*").eq("org_id", callerOrgId).order("date");
    personalEvents = (data as PersonalEventRow[]) || [];
  }

  // Fetch meetings — scoped to org. Treated as production-side entries so
  // they show up in the same feed as projects (PocketLife, Google, Apple).
  let meetings: MeetingRow[] = [];
  if (calType === "all" || calType === "production") {
    const { data } = await db.from("meetings").select("id, title, date, start_time, end_time, client_id, location_text, meeting_address, notes, assigned_user_ids").eq("org_id", callerOrgId).order("date");
    meetings = (data as MeetingRow[]) || [];
    // Staff get only meetings they're assigned to — an unassigned meeting is
    // admin-side, and putting the owner's diary on a contractor's phone is the
    // same leak in a smaller box. Mirrors AppContext's impersonation filter.
    meetings = meetings.filter(m => meetingInFeed(m, viewer));
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
      vevent += `\nDTEND;VALUE=DATE:${nextDayDate(p.date)}`;
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
    } else {
      vevent += `\nDTSTART;VALUE=DATE:${formatICalDate(e.date)}`;
      vevent += `\nDTEND;VALUE=DATE:${nextDayDate(e.date)}`;
    }

    if (e.location) vevent += `\nLOCATION:${esc(e.location)}`;
    if (e.notes) vevent += `\nDESCRIPTION:${esc(e.notes)}`;
    vevent += `\nCATEGORIES:Personal`;
    vevent += `\nEND:VEVENT`;
    events.push(vevent);
  }

  for (const m of meetings) {
    const clientName = m.client_id ? clients[m.client_id] : "";
    const summary = clientName ? `${m.title || "Meeting"} - ${clientName}` : (m.title || "Meeting");

    let vevent = `BEGIN:VEVENT
UID:slate-meeting-${m.id}@sdubmedia.com
DTSTAMP:${formatICalDate(new Date().toISOString().slice(0, 10), "000000")}
SUMMARY:${esc(summary)}`;

    if (m.start_time && m.end_time) {
      vevent += `\nDTSTART:${formatICalDate(m.date, m.start_time)}`;
      vevent += `\nDTEND:${formatICalDate(m.date, m.end_time)}`;
    } else {
      vevent += `\nDTSTART;VALUE=DATE:${formatICalDate(m.date)}`;
      vevent += `\nDTEND;VALUE=DATE:${nextDayDate(m.date)}`;
    }

    const where = m.meeting_address || m.location_text || "";
    if (where) vevent += `\nLOCATION:${esc(where)}`;
    if (m.notes) vevent += `\nDESCRIPTION:${esc(m.notes)}`;
    vevent += `\nSTATUS:CONFIRMED`;
    vevent += `\nCATEGORIES:Meeting`;
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

  // RFC 5545 requires CRLF line endings; the feed is built with \n, so normalize.
  const body = ical.replace(/\r?\n/g, "\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", "inline; filename=slate.ics");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.status(200).send(body);
}
