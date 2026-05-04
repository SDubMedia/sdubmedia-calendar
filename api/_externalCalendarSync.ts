// ============================================================
// Shared logic for fetching + parsing an external iCal feed and
// replacing the cached events. Used by:
//   /api/external-calendar-add (initial validation + first sync)
//   /api/external-calendar-refresh (manual refresh)
//   /api/cron-refresh-external-calendars (every 30 min)
// ============================================================

import * as ical from "node-ical";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

// Apple/iCloud feeds are usually webcal:// — swap to https:// before fetching.
function normalizeUrl(url: string): string {
  if (url.startsWith("webcal://")) return "https://" + url.slice("webcal://".length);
  return url;
}

interface ParsedEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
}

// node-ical's recurring event handling is built into the parser —
// we just enumerate occurrences in a +/- 6-month window from today
// to keep the cache size bounded.
function expandToParsedEvents(parsed: Record<string, ical.CalendarComponent>): ParsedEvent[] {
  const now = new Date();
  const horizonMs = 1000 * 60 * 60 * 24 * 30 * 6; // ~6 months
  const windowStart = new Date(now.getTime() - horizonMs);
  const windowEnd = new Date(now.getTime() + horizonMs);
  const out: ParsedEvent[] = [];

  for (const key of Object.keys(parsed)) {
    const node = parsed[key];
    if (!node || node.type !== "VEVENT") continue;
    const ev = node as ical.VEvent;
    const summary = (typeof ev.summary === "string" ? ev.summary : (ev.summary as { val?: string })?.val) || "";
    const description = typeof ev.description === "string" ? ev.description : "";
    const location = typeof ev.location === "string" ? ev.location : "";
    const baseUid = ev.uid || key;
    const allDay = (ev.datetype === "date") || (typeof ev.start === "object" && (ev.start as Date & { dateOnly?: boolean }).dateOnly === true);

    if (ev.rrule) {
      // Recurring — expand to each occurrence in the window.
      const occurrences = ev.rrule.between(windowStart, windowEnd, true);
      const duration = ev.end && ev.start ? (new Date(ev.end as Date).getTime() - new Date(ev.start as Date).getTime()) : null;
      for (const occ of occurrences) {
        const startAt = new Date(occ);
        const endAt = duration ? new Date(startAt.getTime() + duration) : null;
        out.push({
          uid: `${baseUid}::${startAt.toISOString()}`,
          title: summary,
          description,
          location,
          startAt,
          endAt,
          allDay,
        });
      }
    } else if (ev.start) {
      const startAt = new Date(ev.start as Date);
      if (startAt < windowStart || startAt > windowEnd) continue;
      const endAt = ev.end ? new Date(ev.end as Date) : null;
      out.push({ uid: baseUid, title: summary, description, location, startAt, endAt, allDay });
    }
  }
  return out;
}

export async function syncExternalCalendar(externalCalendarId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: cal, error: calErr } = await supabase
    .from("external_calendars")
    .select("id, url, enabled")
    .eq("id", externalCalendarId)
    .single();
  if (calErr || !cal) return { ok: false, error: "Calendar not found" };
  if (!cal.enabled) return { ok: true, count: 0 };

  try {
    const fetchUrl = normalizeUrl(cal.url);
    // Fetch with a reasonable timeout. Some published Apple feeds
    // respond slowly; cap at 30s.
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 30_000);
    let icsText: string;
    try {
      const res = await fetch(fetchUrl, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);
      icsText = await res.text();
    } finally {
      clearTimeout(timeout);
    }

    const parsed = ical.sync.parseICS(icsText);
    const events = expandToParsedEvents(parsed);

    // Wholesale-replace events for this calendar. Simpler than
    // diffing UIDs and matches "feed = source of truth" semantics.
    await supabase.from("external_events").delete().eq("external_calendar_id", externalCalendarId);
    if (events.length > 0) {
      const rows = events.map((e, i) => ({
        id: `xev_${externalCalendarId.slice(-8)}_${Date.now()}_${i}`,
        external_calendar_id: externalCalendarId,
        ical_uid: e.uid.slice(0, 500),
        title: (e.title || "").slice(0, 500),
        description: (e.description || "").slice(0, 4000),
        location: (e.location || "").slice(0, 500),
        start_at: e.startAt.toISOString(),
        end_at: e.endAt ? e.endAt.toISOString() : null,
        all_day: e.allDay,
      }));
      // Insert in chunks of 500 to avoid hitting Supabase row limits.
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: insErr } = await supabase.from("external_events").insert(chunk);
        if (insErr) throw new Error(insErr.message);
      }
    }

    await supabase
      .from("external_calendars")
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: "",
        event_count: events.length,
      })
      .eq("id", externalCalendarId);

    return { ok: true, count: events.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    await supabase
      .from("external_calendars")
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: msg.slice(0, 1000),
      })
      .eq("id", externalCalendarId);
    return { ok: false, error: msg };
  }
}
