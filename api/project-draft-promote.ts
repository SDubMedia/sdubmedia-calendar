// ============================================================
// Vercel Serverless — promote an approved draft into the project's gallery.
//
// The review loop: the editor posts drafts, the owner watches them, and when
// one is right it becomes the deliverable. Owner only — approving work isn't
// the editor's call.
//
// The gallery row points at the SAME stored file as the draft; nothing is
// copied or re-uploaded, so promoting a 500MB cut is instant and costs no
// extra storage. project-document-url's delete action knows to leave the bytes
// alone while a gallery file still references them.
//
// POST { documentId } -> { ok, deliveryId, fileId }
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { supabaseService } from "./_crewAccess.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const documentId = typeof req.body?.documentId === "string" ? req.body.documentId : "";
  if (!documentId) return res.status(400).json({ error: "documentId required" });

  try {
    const { data: profile } = await supabaseService
      .from("user_profiles").select("role, org_id").eq("id", user.userId).single();
    if (!profile || profile.role !== "owner") {
      return res.status(403).json({ error: "Only the owner can move a draft into the gallery" });
    }
    const orgId = await getUserOrgId(user.userId);
    if (!orgId || orgId !== profile.org_id) return res.status(403).json({ error: "No org" });

    const { data: doc } = await supabaseService
      .from("project_documents")
      .select("id, org_id, project_id, kind, version, file_name, storage_path, size_bytes, mime_type")
      .eq("id", documentId).maybeSingle();
    if (!doc) return res.status(404).json({ error: "Draft not found" });
    if (doc.org_id !== orgId) return res.status(403).json({ error: "Not your draft" });
    if (doc.kind !== "draft") return res.status(400).json({ error: "That file isn't a draft" });

    const { data: project } = await supabaseService
      .from("projects").select("id, org_id, location_id").eq("id", doc.project_id).maybeSingle();
    if (!project || project.org_id !== orgId) return res.status(404).json({ error: "Project not found" });

    // Reuse the project's gallery, or open one as a private draft — same shape
    // crew-gallery-ensure creates, so the two paths can't diverge.
    let deliveryId = "";
    const { data: existing } = await supabaseService
      .from("deliveries").select("id").eq("project_id", doc.project_id).limit(1).maybeSingle();
    if (existing) {
      deliveryId = existing.id;
    } else {
      let title = "Shoot";
      if (project.location_id) {
        const { data: loc } = await supabaseService
          .from("locations").select("address, name").eq("id", project.location_id).maybeSingle();
        title = loc?.address || loc?.name || title;
      }
      deliveryId = randomUUID().replace(/-/g, "").slice(0, 12);
      const now = new Date().toISOString();
      const { error } = await supabaseService.from("deliveries").insert({
        id: deliveryId, org_id: orgId, project_id: doc.project_id, title,
        cover_file_id: null, cover_layout: "center", cover_font: "", cover_subtitle: null, cover_date: null,
        token: randomUUID().replace(/-/g, ""), expires_at: null, selection_limit: 0, download_only: true,
        per_extra_photo_cents: 0, buy_all_flat_cents: 0, status: "draft", updated_at: now,
      });
      if (error) throw new Error(error.message);
    }

    // Idempotent: promoting the same draft twice shouldn't duplicate the file.
    const { data: already } = await supabaseService
      .from("delivery_files").select("id").eq("delivery_id", deliveryId).eq("storage_path", doc.storage_path).maybeSingle();
    if (already) return res.status(200).json({ ok: true, deliveryId, fileId: already.id, alreadyThere: true });

    const { count } = await supabaseService
      .from("delivery_files").select("id", { count: "exact", head: true }).eq("delivery_id", deliveryId);

    const fileId = randomUUID().replace(/-/g, "").slice(0, 12);
    const { error: fileErr } = await supabaseService.from("delivery_files").insert({
      id: fileId, delivery_id: deliveryId, org_id: orgId,
      storage_path: doc.storage_path,
      original_name: doc.file_name,
      size_bytes: doc.size_bytes ?? 0,
      width: 0, height: 0,
      mime_type: doc.mime_type || "application/octet-stream",
      position: count ?? 0,
      media_type: (doc.mime_type || "").startsWith("video/") ? "video" : "image",
      thumbnail_storage_path: "",
      duration_seconds: null,
    });
    if (fileErr) throw new Error(fileErr.message);

    return res.status(200).json({ ok: true, deliveryId, fileId });
  } catch (err) {
    console.error("project-draft-promote error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't move that draft into the gallery") });
  }
}
