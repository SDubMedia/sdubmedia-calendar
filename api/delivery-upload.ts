// Owner-side endpoint: generate a signed R2 upload URL for one file.
// Storage cap is enforced here BEFORE the URL is issued — clients can't
// bypass by uploading directly to R2 because they don't know the bucket creds.
//
// Flow (per file):
//   1. Client calls POST /api/delivery-upload with { deliveryId, fileName, contentType, sizeBytes }
//   2. Server verifies auth + org ownership + Pro tier + storage cap
//   3. Server returns { uploadUrl, storagePath, expiresIn }
//   4. Client PUTs the file directly to R2 with the signed URL
//   5. Client calls registerDeliveryFile() (AppContext) to persist metadata

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { r2BuildKey, r2Configured, r2PresignedUrl } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

// Storage caps in bytes per org. org_sdubmedia (Geoff) bypasses entirely.
const PRO_STORAGE_CAP_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB
const FREE_STORAGE_CAP_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB per single image
const ALLOWED_MIME_PREFIX = ["image/"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  if (!r2Configured()) {
    return res.status(503).json({ error: "Storage not configured. R2 env vars missing." });
  }

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const orgId = await getUserOrgId(user.userId);
  if (!orgId) return res.status(403).json({ error: "No org" });

  const body = (req.body || {}) as Record<string, unknown>;
  const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : 0;

  if (!deliveryId || !fileName || !contentType || sizeBytes <= 0) {
    return res.status(400).json({ error: "Missing deliveryId, fileName, contentType, or sizeBytes" });
  }
  if (!ALLOWED_MIME_PREFIX.some((p) => contentType.startsWith(p))) {
    return res.status(400).json({ error: "Only image uploads allowed in v1" });
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ error: `File too large (max ${Math.floor(MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB per file)` });
  }

  try {
    // 1. Verify the delivery belongs to this org
    const { data: delivery, error: dErr } = await supabase
      .from("deliveries")
      .select("id, org_id, status")
      .eq("id", deliveryId)
      .single();
    if (dErr || !delivery) return res.status(404).json({ error: "Delivery not found" });
    if (delivery.org_id !== orgId) return res.status(403).json({ error: "Not your delivery" });
    if (delivery.status === "delivered") return res.status(400).json({ error: "Delivery already finalized" });

    // 2. Check Pro tier (unless this is org_sdubmedia — Geoff bypasses)
    const isOwnerOrg = orgId === "org_sdubmedia";
    if (!isOwnerOrg) {
      const { data: org } = await supabase.from("organizations").select("plan").eq("id", orgId).single();
      if (!org || org.plan !== "pro") {
        return res.status(402).json({ error: "Galleries require the Pro plan." });
      }
    }

    // 3. Storage cap — sum size of existing files in this org
    if (!isOwnerOrg) {
      const { data: usage } = await supabase
        .from("delivery_files")
        .select("size_bytes")
        .eq("org_id", orgId);
      const usedBytes = (usage || []).reduce((sum: number, r: { size_bytes: number }) => sum + (r.size_bytes || 0), 0);
      const cap = PRO_STORAGE_CAP_BYTES; // we already gated on "pro" plan above
      if (usedBytes + sizeBytes > cap) {
        return res.status(413).json({
          error: `Storage cap reached (${Math.floor(cap / 1024 / 1024 / 1024)}GB). Delete old galleries or contact support.`,
          usedBytes,
          capBytes: cap,
        });
      }
    }

    // 4. Generate the signed PUT URL (15 min — plenty for one file)
    const storagePath = r2BuildKey(orgId, deliveryId, fileName);
    const uploadUrl = r2PresignedUrl({
      method: "PUT",
      key: storagePath,
      expiresIn: 900,
      contentType,
    });

    return res.status(200).json({ ok: true, uploadUrl, storagePath, expiresIn: 900 });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to generate upload URL") });
  }
}

// Re-exporting the cap so the client UI can show "X / 50 GB used" if desired.
export const FREE_CAP = FREE_STORAGE_CAP_BYTES;
export const PRO_CAP = PRO_STORAGE_CAP_BYTES;
