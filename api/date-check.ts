// ============================================================
// Public "is my date open?" check — what a couple lands on from a flyer QR.
//
// POST { slug, date } → { available, businessName }. Booked means any
// non-cancelled project (any of its days, for multi-day shoots) falls on that
// date. Nothing else about the calendar is exposed: no names, no counts, no
// neighbouring dates. Inquiries go through /api/capture-pipeline-lead.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { projectDaysRow } from "./_projectDays.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const body = (req.body || {}) as Record<string, unknown>;
  const slug = String(body.slug || "").trim().toLowerCase().slice(0, 80);
  const date = String(body.date || "").trim();
  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    return res.status(400).json({ error: "Pick a date" });
  }

  const { data: org } = await supabase.from("organizations").select("id, name").eq("slug", slug).maybeSingle<{ id: string; name: string }>();
  if (!org) return res.status(404).json({ error: "Unknown site." });

  // Multi-day shoots start before the date asked about; look back two weeks.
  const { data: rows, error } = await supabase
    .from("projects")
    .select("date, start_time, end_time, day_schedules, status")
    .eq("org_id", org.id)
    .gte("date", shiftDate(date, -14))
    .lte("date", date)
    .neq("status", "cancelled");
  if (error) {
    console.error("[date-check]", error.message);
    return res.status(500).json({ error: "Couldn't check that date right now." });
  }
  const booked = (rows || []).some(p => projectDaysRow(p as never).some(d => d.date === date));
  return res.status(200).json({ available: !booked, businessName: org.name });
}
