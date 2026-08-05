// ============================================================
// Register a file an assigned crew member just uploaded to a project's gallery.
// The bytes go up via /api/delivery-upload (already org-scoped); this records
// the delivery_files row, which staff can't write directly (RLS). Service-role
// after verifying the caller is assigned crew on the gallery's project.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { verifyAuth, errorMessage } from "./_auth.js";
import { r2DeleteObject } from "./_r2.js";
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

    const access = await verifyCrewOnProject(user.userId, delivery.project_id, "gallery");
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (delivery.org_id !== access.orgId) return res.status(403).json({ error: "Not your gallery" });

    // Same filename already in this gallery? Replace it rather than adding a
    // second copy. Melissa uploaded a session twice and the gallery doubled —
    // 60 duplicate frames the client would have had to wade through. Replacing
    // also does the right thing when an editor re-sends a corrected frame: the
    // client sees the new one, not both.
    const { data: existing } = await supabaseService
      .from("delivery_files")
      .select("id, storage_path")
      .eq("delivery_id", deliveryId)
      .eq("original_name", originalName)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabaseService.from("delivery_files").update({
        storage_path: storagePath,
        size_bytes: Number(b.sizeBytes ?? 0),
        width: Number(b.width ?? 0),
        height: Number(b.height ?? 0),
        mime_type: typeof b.mimeType === "string" ? b.mimeType : "image/jpeg",
        media_type: b.mediaType === "video" ? "video" : "image",
        thumbnail_storage_path: typeof b.thumbnailStoragePath === "string" ? b.thumbnailStoragePath : "",
        duration_seconds: b.durationSeconds ?? null,
      }).eq("id", existing.id);
      if (updErr) throw new Error(updErr.message);
      // Drop the superseded bytes, but only after the row points at the new
      // ones — losing the file would be worse than leaving it orphaned.
      if (existing.storage_path && existing.storage_path !== storagePath) {
        try { await r2DeleteObject(existing.storage_path); }
        catch (delErr) { console.warn("[crew-register-file] old file left in storage:", errorMessage(delErr)); }
      }
      return res.status(200).json({ ok: true, id: existing.id, replaced: true });
    }

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
