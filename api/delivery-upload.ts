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
// 200 GB on Pro is a hard ceiling, not a billing trigger — over the cap
// the user gets a friendly "delete old galleries" message instead of
// being charged. Worst-case R2 storage cost at 200GB ≈ $3/month/user,
// well within the Pro margin.
const PRO_STORAGE_CAP_BYTES = 200 * 1024 * 1024 * 1024; // 200 GB
const FREE_STORAGE_CAP_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB per single image
const MAX_VIDEO_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GB per single video
const MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — JPEG frame capture is small
const IMAGE_MIME_PREFIX = "image/";
// Restrict to the formats the user explicitly asked for (mp4, mov, m4v).
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",   // .mov
  "video/x-m4v",       // .m4v
]);

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
  // "kind" lets the client tell us this is a thumbnail (small JPEG companion
  // to a parent video) rather than a primary deliverable. Thumbnails skip the
  // storage cap (they're trivial) and live under a separate path prefix.
  const kind = body.kind === "thumbnail" ? "thumbnail" : "file";

  if (!deliveryId || !fileName || !contentType || sizeBytes <= 0) {
    return res.status(400).json({ error: "Missing deliveryId, fileName, contentType, or sizeBytes" });
  }

  // Validate MIME + size based on what's being uploaded.
  const isImage = contentType.startsWith(IMAGE_MIME_PREFIX);
  const isVideo = ALLOWED_VIDEO_MIME.has(contentType);
  if (kind === "thumbnail") {
    if (!isImage) return res.status(400).json({ error: "Thumbnail must be an image" });
    if (sizeBytes > MAX_THUMBNAIL_SIZE_BYTES) {
      return res.status(413).json({ error: `Thumbnail too large (max ${Math.floor(MAX_THUMBNAIL_SIZE_BYTES / 1024 / 1024)}MB)` });
    }
  } else {
    if (!isImage && !isVideo) {
      return res.status(400).json({ error: "Only images (any) and videos (.mp4, .mov, .m4v) are allowed" });
    }
    const cap = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
    if (sizeBytes > cap) {
      return res.status(413).json({ error: `${isVideo ? "Video" : "Image"} too large (max ${Math.floor(cap / 1024 / 1024)}MB per file)` });
    }
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

    // 3. Storage cap — sum size of existing files in this org. Thumbnails
    // skip the cap because they're trivial companions to existing videos.
    if (!isOwnerOrg && kind !== "thumbnail") {
      const { data: usage } = await supabase
        .from("delivery_files")
        .select("size_bytes")
        .eq("org_id", orgId);
      const usedBytes = (usage || []).reduce((sum: number, r: { size_bytes: number }) => sum + (r.size_bytes || 0), 0);
      const cap = PRO_STORAGE_CAP_BYTES; // we already gated on "pro" plan above
      if (usedBytes + sizeBytes > cap) {
        return res.status(413).json({
          error: `You're at your ${Math.floor(cap / 1024 / 1024 / 1024)} GB storage cap. To upload more, archive or delete an old gallery to free up space.`,
          usedBytes,
          capBytes: cap,
        });
      }
    }

    // 4. Generate the signed PUT URL (15 min — plenty for one file).
    // Thumbnails get a distinct path prefix so we can spot/clean them later.
    const baseKey = r2BuildKey(orgId, deliveryId, fileName);
    const storagePath = kind === "thumbnail" ? baseKey.replace(`${orgId}/${deliveryId}/`, `${orgId}/${deliveryId}/thumbnails/`) : baseKey;
    // 1-hour window so a large upload (videos up to 1 GB) has time to finish
    // even on a modest office connection before the signed URL expires.
    const uploadUrl = r2PresignedUrl({
      method: "PUT",
      key: storagePath,
      expiresIn: 3600,
      contentType,
    });

    return res.status(200).json({ ok: true, uploadUrl, storagePath, expiresIn: 3600 });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to generate upload URL") });
  }
}

// Re-exporting the cap so the client UI can show "X / 50 GB used" if desired.
export const FREE_CAP = FREE_STORAGE_CAP_BYTES;
export const PRO_CAP = PRO_STORAGE_CAP_BYTES;
