// ============================================================
// Tell staff they've been put on a project — push + email, once per
// (project, crew member). Owner-triggered right after the project dialog
// saves; safe to call on every save because project_assignment_notices
// remembers who has already been told. Someone removed and re-added is not
// told twice. Cancelled projects notify nobody.
//
// Separate from notify-shoot-confirmations (the "please confirm you're
// available" flow for flagged crew) — that one is a question, this is a
// heads-up, and everyone gets it.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { randomUUID } from "crypto";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";
import { sendPushToUser } from "./_apns.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

type CrewEntry = { crewMemberId?: string; crew_member_id?: string; role?: string };
type DayEntry = { crewMemberIds?: string[] };
const memberId = (c: CrewEntry) => c.crewMemberId || c.crew_member_id || "";

function fmtDate(d: string): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  if (!m) return "";
  const h = Number(m[1]); const ampm = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${m[2]} ${ampm}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { projectId } = req.body || {};
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    // Optional: the sheet's per-person "Notify" button names exactly who.
    const only: string[] | null = Array.isArray(req.body?.crewMemberIds)
      ? (req.body.crewMemberIds as unknown[]).filter((x): x is string => typeof x === "string" && !!x)
      : null;

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || (profile.role !== "owner" && profile.role !== "partner")) return res.status(403).json({ error: "Not allowed" });
    const orgId = await getUserOrgId(caller.userId);

    const { data: project } = await supabase
      .from("projects")
      .select("id, org_id, status, date, start_time, crew, post_production, day_schedules, client_id, project_type_id, location_id")
      .eq("id", projectId).single();
    if (!project || project.org_id !== orgId) return res.status(404).json({ error: "Project not found" });
    if (project.status === "cancelled") return res.status(200).json({ ok: true, notified: 0 });

    const crew: CrewEntry[] = Array.isArray(project.crew) ? project.crew : [];
    const post: CrewEntry[] = Array.isArray(project.post_production) ? project.post_production : [];
    const days: DayEntry[] = Array.isArray(project.day_schedules) ? project.day_schedules : [];
    const roleOf = new Map<string, string>();
    for (const c of [...crew, ...post]) { const id = memberId(c); if (id && c.role && !roleOf.has(id)) roleOf.set(id, c.role); }
    const assignedIds = Array.from(new Set([
      ...crew.map(memberId),
      ...post.map(memberId),
      ...days.flatMap(d => d.crewMemberIds || []),
    ].filter(Boolean))).filter(id => !only || only.includes(id));
    if (assignedIds.length === 0) return res.status(200).json({ ok: true, notified: 0 });

    const { data: told } = await supabase
      .from("project_assignment_notices").select("crew_member_id").eq("project_id", projectId).in("crew_member_id", assignedIds);
    const toldSet = new Set((told || []).map(r => r.crew_member_id));
    const toNotify = assignedIds.filter(id => !toldSet.has(id));
    if (toNotify.length === 0) return res.status(200).json({ ok: true, notified: 0 });

    // The owner's own crew row gets no "you've been added" — they added themselves.
    const { data: ownerProfile } = await supabase.from("user_profiles").select("crew_member_id").eq("id", caller.userId).single();

    const [{ data: members }, { data: client }, { data: pType }, { data: loc }] = await Promise.all([
      supabase.from("crew_members").select("id, name, email").eq("org_id", orgId).in("id", toNotify),
      project.client_id ? supabase.from("clients").select("company").eq("id", project.client_id).maybeSingle() : Promise.resolve({ data: null }),
      project.project_type_id ? supabase.from("project_types").select("name").eq("id", project.project_type_id).maybeSingle() : Promise.resolve({ data: null }),
      project.location_id ? supabase.from("locations").select("name").eq("id", project.location_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const what = [pType?.name || "Shoot", client?.company].filter(Boolean).join(" · ");
    const when = [fmtDate(project.date), fmtTime(project.start_time)].filter(Boolean).join(" at ");
    const where = loc?.name || "";
    const more = days.length > 1 ? ` (${days.length} days)` : "";

    let notified = 0;
    const now = new Date().toISOString();
    for (const m of members || []) {
      if (ownerProfile?.crew_member_id && m.id === ownerProfile.crew_member_id) continue;
      const { data: staffProfiles } = await supabase
        .from("user_profiles").select("id").eq("crew_member_id", m.id).eq("org_id", orgId).eq("role", "staff");
      const role = roleOf.get(m.id) || "";
      const first = escapeHtml((m.name || "there").split(" ")[0]);
      const body = `${what}${when ? ` — ${when}` : ""}${more}`;

      // Best-effort, awaited, settled independently (see CLAUDE.md on
      // fire-and-forget in handlers). A push failure never costs the email.
      const sideEffects: Promise<unknown>[] = (staffProfiles || []).map(sp =>
        sendPushToUser(sp.id, { title: role ? `You're on a project as ${role}` : "You've been added to a project", body, data: { url: "/my-schedule" } }),
      );
      const email = (m.email || "").trim();
      if (email) {
        sideEffects.push(resend.emails.send({
          from: `Slate <${FROM_EMAIL}>`, to: email,
          subject: `You've been added: ${what}${when ? ` — ${when}` : ""}`,
          html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
            <p style="font-size:15px;line-height:1.6;">Hi ${first},</p>
            <p style="font-size:15px;line-height:1.6;">You've been added to <strong>${escapeHtml(what)}</strong>${role ? ` as <strong>${escapeHtml(role)}</strong>` : ""}.</p>
            <table style="font-size:14px;line-height:1.7;border-collapse:collapse;">
              ${when ? `<tr><td style="color:#64748b;padding-right:14px;">When</td><td>${escapeHtml(when)}${escapeHtml(more)}</td></tr>` : ""}
              ${where ? `<tr><td style="color:#64748b;padding-right:14px;">Where</td><td>${escapeHtml(where)}</td></tr>` : ""}
            </table>
            <p style="margin:20px 0;"><a href="${APP_URL}/my-schedule" style="background:#0088ff;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Open in Slate</a></p>
            <p style="font-size:12px;color:#64748b;">Details can change — the app is always current.</p>
          </div>`,
        }).then(r => { if (r.error) throw new Error(r.error.message); return r; }));
      }
      const settled = await Promise.allSettled(sideEffects);
      settled.forEach(r => { if (r.status === "rejected") console.warn(`[notify-project-assignment] ${m.name}: ${errorMessage(r.reason)}`); });

      // Recorded even if both channels failed: a retry storm of half-sent
      // notices is worse than one missed heads-up, and the app shows it anyway.
      await supabase.from("project_assignment_notices").insert({
        id: randomUUID(), org_id: orgId, project_id: projectId, crew_member_id: m.id, notified_at: now,
      });
      notified++;
    }

    return res.status(200).json({ ok: true, notified });
  } catch (err) {
    console.error("notify-project-assignment error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't send the notifications") });
  }
}
