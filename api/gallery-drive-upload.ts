// ============================================================
// Owner "Send to Google Drive": transfer ONE gallery file from R2 to the Drive
// subfolder (server-to-server). The client calls this once per file (from the
// list gallery-drive-prepare returned) so each request stays small. Owner-only.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { accessTokenFromRefresh, decryptToken, uploadFile, googleConfigured } from "./_google.js";
import { r2PresignedUrl } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  if (!googleConfigured()) return res.status(400).json({ error: "Google Drive isn't configured" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { deliveryId, fileId, folderId } = req.body || {};
    if (!deliveryId || !fileId || !folderId) return res.status(400).json({ error: "deliveryId, fileId, folderId required" });

    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can send to Drive" });
    const orgId = await getUserOrgId(caller.userId);

    const { data: org } = await supabase.from("organizations").select("google_drive_refresh_token").eq("id", orgId).single();
    const refresh = decryptToken(org?.google_drive_refresh_token || "");
    if (!refresh) return res.status(400).json({ error: "Connect Google Drive first" });

    // The file must belong to this delivery, and the delivery to this org.
    const { data: file } = await supabase
      .from("delivery_files").select("id, delivery_id, storage_path, original_name, mime_type").eq("id", fileId).single();
    if (!file || file.delivery_id !== deliveryId) return res.status(404).json({ error: "File not found" });
    const { data: delivery } = await supabase.from("deliveries").select("org_id").eq("id", deliveryId).single();
    if (!delivery || delivery.org_id !== orgId) return res.status(403).json({ error: "Not your gallery" });
    if (!file.storage_path) return res.status(400).json({ error: "File has no stored copy" });

    // Pull the bytes from R2, push to Drive.
    const url = r2PresignedUrl({ method: "GET", key: file.storage_path, expiresIn: 300 });
    const r2res = await fetch(url);
    if (!r2res.ok) return res.status(502).json({ error: "Couldn't read the file from storage" });
    const bytes = Buffer.from(await r2res.arrayBuffer());

    const accessToken = await accessTokenFromRefresh(refresh);
    await uploadFile(accessToken, folderId, file.original_name || `${fileId}`, file.mime_type || "application/octet-stream", bytes);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("gallery-drive-upload error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't upload to Drive") });
  }
}
