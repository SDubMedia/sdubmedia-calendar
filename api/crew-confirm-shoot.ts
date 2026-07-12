// ============================================================
// A flagged crew member confirms they're available for a shoot they're
// assigned to. Staff-scoped: verifies the caller is on the project's crew (any
// role), then stamps confirmed_at on their shoot_confirmations row (creating it
// if they weren't pre-notified). Idempotent.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { verifyAuth, errorMessage } from "./_auth.js";
import { supabaseService } from "./_crewAccess.js";

type CrewEntry = { crewMemberId?: string; crew_member_id?: string };
const memberId = (c: CrewEntry) => c.crewMemberId || c.crew_member_id || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { projectId } = req.body || {};
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const { data: profile } = await supabaseService
      .from("user_profiles").select("role, crew_member_id, org_id").eq("id", user.userId).single();
    if (!profile || profile.role !== "staff" || !profile.crew_member_id) {
      return res.status(403).json({ error: "Only assigned crew can confirm" });
    }
    const myId = profile.crew_member_id;

    const { data: project } = await supabaseService
      .from("projects").select("id, org_id, crew, post_production").eq("id", projectId).single();
    if (!project || project.org_id !== profile.org_id) return res.status(404).json({ error: "Project not found" });

    // Assigned in ANY role (crew or post) — flagged confirmation isn't limited
    // to shooters/editors like the upload guard is.
    const crew: CrewEntry[] = Array.isArray(project.crew) ? project.crew : [];
    const post: CrewEntry[] = Array.isArray(project.post_production) ? project.post_production : [];
    if (![...crew, ...post].some(c => memberId(c) === myId)) {
      return res.status(403).json({ error: "You're not assigned to this shoot" });
    }

    const now = new Date().toISOString();
    const { data: existing } = await supabaseService
      .from("shoot_confirmations").select("id").eq("project_id", projectId).eq("crew_member_id", myId).maybeSingle();
    if (existing) {
      const { error } = await supabaseService.from("shoot_confirmations").update({ confirmed_at: now }).eq("id", existing.id);
      if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't confirm") });
    } else {
      const { error } = await supabaseService.from("shoot_confirmations").insert({
        id: randomUUID(), org_id: profile.org_id, project_id: projectId, crew_member_id: myId, confirmed_at: now,
      });
      if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't confirm") });
    }

    return res.status(200).json({ ok: true, confirmedAt: now });
  } catch (err) {
    console.error("crew-confirm-shoot error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to confirm") });
  }
}
