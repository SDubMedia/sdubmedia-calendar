// ============================================================
// Owner-triggered after saving a project: push a "please confirm you're
// available" notification to any flagged crew member newly assigned to the
// shoot who hasn't been notified yet. Creates their shoot_confirmations row
// with notified_at so we don't re-notify on later edits. Idempotent.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { sendPushToUser } from "./_apns.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

type CrewEntry = { crewMemberId?: string; crew_member_id?: string };
const memberId = (c: CrewEntry) => c.crewMemberId || c.crew_member_id || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { projectId } = req.body || {};
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || (profile.role !== "owner" && profile.role !== "partner")) return res.status(403).json({ error: "Not allowed" });
    const orgId = await getUserOrgId(caller.userId);

    const { data: project } = await supabase
      .from("projects").select("id, org_id, date, crew, post_production, location_id").eq("id", projectId).single();
    if (!project || project.org_id !== orgId) return res.status(404).json({ error: "Project not found" });

    const crew: CrewEntry[] = Array.isArray(project.crew) ? project.crew : [];
    const post: CrewEntry[] = Array.isArray(project.post_production) ? project.post_production : [];
    const assignedIds = Array.from(new Set([...crew, ...post].map(memberId).filter(Boolean)));
    if (assignedIds.length === 0) return res.status(200).json({ ok: true, notified: 0 });

    // Which of the assigned crew are flagged as requiring confirmation?
    const { data: members } = await supabase
      .from("crew_members").select("id").eq("org_id", orgId).eq("requires_shoot_confirmation", true).in("id", assignedIds);
    const flaggedIds = (members || []).map(m => m.id);
    if (flaggedIds.length === 0) return res.status(200).json({ ok: true, notified: 0 });

    // Skip anyone who already has a confirmation row (already notified or confirmed).
    const { data: existing } = await supabase
      .from("shoot_confirmations").select("crew_member_id").eq("project_id", projectId).in("crew_member_id", flaggedIds);
    const alreadyRowed = new Set((existing || []).map(r => r.crew_member_id));
    const toNotify = flaggedIds.filter(id => !alreadyRowed.has(id));
    if (toNotify.length === 0) return res.status(200).json({ ok: true, notified: 0 });

    const dateLabel = project.date
      ? new Date(project.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      : "an upcoming date";

    let notified = 0;
    const now = new Date().toISOString();
    for (const crewMemberId of toNotify) {
      // The staff login for this crew member (if any).
      const { data: staffProfiles } = await supabase.from("user_profiles").select("id").eq("crew_member_id", crewMemberId).eq("org_id", orgId);
      for (const sp of staffProfiles || []) {
        await sendPushToUser(sp.id, {
          title: "Confirm your availability",
          body: `Please confirm you're available for the shoot on ${dateLabel}.`,
          data: { url: "/my-schedule" },
        });
      }
      await supabase.from("shoot_confirmations").insert({
        id: randomUUID(), org_id: orgId, project_id: projectId, crew_member_id: crewMemberId, notified_at: now,
      });
      notified++;
    }

    return res.status(200).json({ ok: true, notified });
  } catch (err) {
    console.error("notify-shoot-confirmations error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to notify") });
  }
}
