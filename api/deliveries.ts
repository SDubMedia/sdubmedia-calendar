// Owner-side endpoint for delivery operations that can't be done from the
// frontend directly (password hashing, R2 cleanup on file delete, etc.).
// Most CRUD goes through Supabase via AppContext; this handles the rest.
//
// Actions:
//   set-password    — body { id, password } sets/clears password (empty = clear)
//   delete-file     — body { fileId } removes from R2 + delete row
//   delete-delivery — body { id } removes all R2 files + delete delivery (cascades)

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { hashPassword } from "./_password.js";
import { r2Configured, r2DeleteObject, r2PresignedUrl } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const orgId = await getUserOrgId(user.userId);
  if (!orgId) return res.status(403).json({ error: "No org" });

  const body = (req.body || {}) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  try {
    switch (action) {
      case "set-password": return await setPassword(body, orgId, res);
      case "delete-file": return await deleteFile(body, orgId, res);
      case "delete-delivery": return await deleteDelivery(body, orgId, res);
      case "signed-urls": return await signedUrls(body, orgId, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }
}

async function setPassword(body: Record<string, unknown>, orgId: string, res: VercelResponse) {
  const id = typeof body.id === "string" ? body.id : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data: row, error: lookupErr } = await supabase
    .from("deliveries")
    .select("org_id")
    .eq("id", id)
    .single();
  if (lookupErr || !row) return res.status(404).json({ error: "Delivery not found" });
  if (row.org_id !== orgId) return res.status(403).json({ error: "Not your delivery" });

  const password_hash = password ? hashPassword(password) : null;
  const { error } = await supabase
    .from("deliveries")
    .update({ password_hash, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  return res.status(200).json({ ok: true });
}

async function deleteFile(body: Record<string, unknown>, orgId: string, res: VercelResponse) {
  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  if (!fileId) return res.status(400).json({ error: "Missing fileId" });

  const { data: file, error: lookupErr } = await supabase
    .from("delivery_files")
    .select("org_id, storage_path")
    .eq("id", fileId)
    .single();
  if (lookupErr || !file) return res.status(404).json({ error: "File not found" });
  if (file.org_id !== orgId) return res.status(403).json({ error: "Not your file" });

  // Best-effort R2 cleanup. If it fails we still let the row delete proceed —
  // a stray R2 object is far less bad than a stuck DB row.
  if (r2Configured()) {
    try { await r2DeleteObject(file.storage_path); } catch { /* swallow */ }
  }

  const { error } = await supabase.from("delivery_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);

  return res.status(200).json({ ok: true });
}

async function signedUrls(body: Record<string, unknown>, orgId: string, res: VercelResponse) {
  const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
  if (!deliveryId) return res.status(400).json({ error: "Missing deliveryId" });
  // Optional filter — pass `fileIds` to only sign a subset (e.g. just the
  // cover photo) for fast eager loading.
  const fileIdsRaw = Array.isArray(body.fileIds) ? body.fileIds : null;
  const fileIds = fileIdsRaw ? fileIdsRaw.filter((x): x is string => typeof x === "string") : null;

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("org_id")
    .eq("id", deliveryId)
    .single();
  if (!delivery) return res.status(404).json({ error: "Delivery not found" });
  if (delivery.org_id !== orgId) return res.status(403).json({ error: "Not your delivery" });

  let query = supabase
    .from("delivery_files")
    .select("id, storage_path")
    .eq("delivery_id", deliveryId);
  if (fileIds && fileIds.length > 0) query = query.in("id", fileIds);
  const { data: files } = await query;

  const urls = (files || []).map((f: { id: string; storage_path: string }) => ({
    id: f.id,
    url: r2Configured() ? r2PresignedUrl({ method: "GET", key: f.storage_path, expiresIn: 3600 }) : "",
  }));

  return res.status(200).json({ ok: true, urls });
}

async function deleteDelivery(body: Record<string, unknown>, orgId: string, res: VercelResponse) {
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data: delivery, error: lookupErr } = await supabase
    .from("deliveries")
    .select("org_id")
    .eq("id", id)
    .single();
  if (lookupErr || !delivery) return res.status(404).json({ error: "Delivery not found" });
  if (delivery.org_id !== orgId) return res.status(403).json({ error: "Not your delivery" });

  // Pull all storage paths first, then cascade-delete the row, then clean R2.
  const { data: files } = await supabase
    .from("delivery_files")
    .select("storage_path")
    .eq("delivery_id", id);

  const { error } = await supabase.from("deliveries").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (r2Configured()) {
    await Promise.all(
      (files || []).map((f: { storage_path: string }) =>
        r2DeleteObject(f.storage_path).catch(() => { /* swallow per-file */ })
      )
    );
  }

  return res.status(200).json({ ok: true });
}
