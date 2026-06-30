// ============================================================
// Register a file an assigned crew member just uploaded to a project's gallery.
// The bytes go up via /api/delivery-upload (already org-scoped); this records
// the delivery_files row, which staff can't write directly (RLS). Service-role
// after verifying the caller is assigned crew on the gallery's project.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { verifyAuth, errorMessage } from "./_auth.js";
import { supabaseService, verifyCrewOnProject } from "./_crewAccess.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const b = req.body ?? {};
  const deliveryId = typeof b.deliveryId === "string" ? b.deliveryId : "";
  const storagePath = typeof b.storagePath === "string" ? b.storagePath : "";
  const originalName = typeof b.originalName === "string" ? b.originalName : "";
  if (!deliveryId || !storagePath || !originalName) {
    return res.status(400).json({ error: "Missing deliveryId, storagePath, or originalName" });
  }

  try {
    const { data: delivery } = await supabaseService
      .from("deliveries").select("id, project_id, org_id").eq("id", deliveryId).single();
    if (!delivery || !delivery.project_id) return res.status(404).json({ error: "Gallery not found" });

    const access = await verifyCrewOnProject(user.userId, delivery.project_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (delivery.org_id !== access.orgId) return res.status(403).json({ error: "Not your gallery" });

    const id = randomUUID().replace(/-/g, "").slice(0, 12);
    const { data: row, error } = await supabaseService.from("delivery_files").insert({
      id, delivery_id: deliveryId, org_id: delivery.org_id,
      storage_path: storagePath,
      original_name: originalName,
      size_bytes: Number(b.sizeBytes ?? 0),
      width: Number(b.width ?? 0),
      height: Number(b.height ?? 0),
      mime_type: typeof b.mimeType === "string" ? b.mimeType : "image/jpeg",
      position: Number(b.position ?? 0),
      media_type: b.mediaType === "video" ? "video" : "image",
      thumbnail_storage_path: typeof b.thumbnailStoragePath === "string" ? b.thumbnailStoragePath : "",
      duration_seconds: b.durationSeconds ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true, id: row?.id });
  } catch (err) {
    console.error("crew-register-file error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't save the photo") });
  }
}
