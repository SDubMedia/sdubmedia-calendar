// ============================================================
// Assigned crew move their job along the pipeline (Upcoming → Filmed → Editing
// → Editing Done → Delivered) from their own schedule. Staff can't write the
// projects table directly (RLS), so this runs with the service role after
// verifying the caller is assigned crew on the job. Never cancels a project.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth, errorMessage } from "./_auth.js";
import { supabaseService, verifyCrewOnProject } from "./_crewAccess.js";

const ALLOWED = new Set(["upcoming", "filming_done", "in_editing", "editing_done", "delivered"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { projectId, status } = req.body ?? {};
  if (!projectId || typeof projectId !== "string") return res.status(400).json({ error: "Missing projectId" });
  if (!ALLOWED.has(status)) return res.status(400).json({ error: "Not an allowed status" });

  try {
    const access = await verifyCrewOnProject(user.userId, projectId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const { error } = await supabaseService.from("projects")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", projectId);
    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true, status });
  } catch (err) {
    console.error("crew-update-status error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't update status") });
  }
}
