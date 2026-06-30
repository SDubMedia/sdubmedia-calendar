// ============================================================
// Get (or create) the gallery for a project so assigned crew can upload finals.
// Returns the deliveryId. The gallery is created as a private draft — it never
// reaches the client until the owner delivers it. Service-role after verifying
// the caller is assigned crew on the job.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { verifyAuth, errorMessage } from "./_auth.js";
import { supabaseService, verifyCrewOnProject } from "./_crewAccess.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { projectId } = req.body ?? {};
  if (!projectId || typeof projectId !== "string") return res.status(400).json({ error: "Missing projectId" });

  try {
    const access = await verifyCrewOnProject(user.userId, projectId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    // Reuse an existing gallery for this project if there is one.
    const { data: existing } = await supabaseService
      .from("deliveries").select("id").eq("project_id", projectId).limit(1).maybeSingle();
    if (existing) return res.status(200).json({ deliveryId: existing.id });

    // Title from the property address (or location name), like the owner flow.
    let title = "Shoot";
    if (access.project.location_id) {
      const { data: loc } = await supabaseService
        .from("locations").select("address, name").eq("id", access.project.location_id).maybeSingle();
      title = (loc?.address || loc?.name || title);
    }

    const id = randomUUID().replace(/-/g, "").slice(0, 12);
    const token = randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    const { error } = await supabaseService.from("deliveries").insert({
      id, org_id: access.orgId, project_id: projectId, title,
      cover_file_id: null, cover_layout: "center", cover_font: "", cover_subtitle: null, cover_date: null,
      token, expires_at: null, selection_limit: 0, download_only: true,
      per_extra_photo_cents: 0, buy_all_flat_cents: 0, status: "draft", updated_at: now,
    });
    if (error) throw new Error(error.message);

    return res.status(200).json({ deliveryId: id });
  } catch (err) {
    console.error("crew-gallery-ensure error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't open the gallery") });
  }
}
