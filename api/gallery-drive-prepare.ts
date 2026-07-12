// ============================================================
// Owner "Send to Google Drive": ensure the "Slate Galleries" parent folder and
// a per-property-address subfolder exist, and return the subfolder id + the
// gallery's file list. The client then uploads each file via
// gallery-drive-upload (one per request, to stay within serverless limits).
// Owner-only.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { accessTokenFromRefresh, decryptToken, ensureFolder, googleConfigured } from "./_google.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const PARENT_NAME = "Slate Galleries";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  if (!googleConfigured()) return res.status(400).json({ error: "Google Drive isn't configured" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { deliveryId } = req.body || {};
    if (!deliveryId) return res.status(400).json({ error: "deliveryId required" });

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can send to Drive" });
    const orgId = await getUserOrgId(caller.userId);

    const { data: org } = await supabase
      .from("organizations").select("google_drive_refresh_token, google_drive_folder_id").eq("id", orgId).single();
    const refresh = decryptToken(org?.google_drive_refresh_token || "");
    if (!refresh) return res.status(400).json({ error: "Connect Google Drive first (Manage → Settings)." });

    const { data: delivery } = await supabase
      .from("deliveries").select("id, org_id, title").eq("id", deliveryId).single();
    if (!delivery || delivery.org_id !== orgId) return res.status(404).json({ error: "Gallery not found" });

    const accessToken = await accessTokenFromRefresh(refresh);

    // Parent "Slate Galleries" (reuse the stored id, else find/create + save).
    let parentId = org?.google_drive_folder_id || "";
    if (!parentId) {
      parentId = await ensureFolder(accessToken, PARENT_NAME);
      await supabase.from("organizations").update({ google_drive_folder_id: parentId }).eq("id", orgId);
    }

    // Per-property subfolder.
    const subName = (delivery.title || "Gallery").trim() || "Gallery";
    const folderId = await ensureFolder(accessToken, subName, parentId);

    const { data: files } = await supabase
      .from("delivery_files").select("id, original_name").eq("delivery_id", deliveryId).order("position");
    const list = (files || []).map(f => ({ id: f.id, name: f.original_name || "" }));

    return res.status(200).json({ ok: true, folderId, folderName: subName, files: list, count: list.length });
  } catch (err) {
    console.error("gallery-drive-prepare error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't prepare the Drive folder") });
  }
}
