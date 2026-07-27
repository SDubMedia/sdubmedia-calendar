// ============================================================
// Set a project's on-camera talent (a list of featured names). Owner or crew
// assigned to the job may edit it. Staff can't write the projects table
// directly (RLS is read-only for them), so this runs with the service role
// after verifying the caller is the owner or assigned crew — mirroring
// crew-update-status.
//
// POST { projectId, talent: string[] } -> { ok, talent }
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { supabaseService, verifyCrewOnProject } from "./_crewAccess.js";

const MAX_NAMES = 30;
const MAX_LEN = 80;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { projectId, talent } = req.body ?? {};
  if (!projectId || typeof projectId !== "string") return res.status(400).json({ error: "Missing projectId" });
  if (!Array.isArray(talent)) return res.status(400).json({ error: "talent must be an array" });

  // Sanitize: trim, drop blanks, cap length + count.
  const clean = talent
    .filter((t): t is string => typeof t === "string")
    .map(t => t.trim().slice(0, MAX_LEN))
    .filter(Boolean)
    .slice(0, MAX_NAMES);

  try {
    // Owner path: allowed on any project in their own org.
    const { data: profile } = await supabaseService
      .from("user_profiles").select("role, org_id").eq("id", user.userId).single();
    let allowed = false;
    if (profile?.role === "owner") {
      const callerOrg = await getUserOrgId(user.userId);
      const { data: project } = await supabaseService
        .from("projects").select("org_id").eq("id", projectId).single();
      if (!project) return res.status(404).json({ error: "Project not found" });
      allowed = !!callerOrg && project.org_id === callerOrg;
      if (!allowed) return res.status(403).json({ error: "Not your project" });
    } else {
      // Staff path: must be assigned crew on this job.
      const access = await verifyCrewOnProject(user.userId, projectId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      allowed = true;
    }

    const { error } = await supabaseService.from("projects")
      .update({ on_camera_talent: clean, updated_at: new Date().toISOString() }).eq("id", projectId);
    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true, talent: clean });
  } catch (err) {
    console.error("project-talent error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't save talent") });
  }
}
