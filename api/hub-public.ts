// ============================================================
// Public: a client's hub — every delivered gallery on their projects,
// newest first, plus the finished films and photographs from the ungated
// ones merged for instant reference. Token-addressed, no login.
// Rules in _clientHub.ts. Service role; everything served here is what
// the galleries' own public links already serve.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { errorMessage, publicBusinessInfo } from "./_auth.js";
import { r2Configured, r2PresignedUrl, isCameraRaw } from "./_r2.js";
import { hubGalleries, hubMergedFiles, isGated, type HubDeliveryRow } from "./_clientHub.js";
import { resolveTone } from "./_galleryPresentation.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

interface DeliveryRow extends HubDeliveryRow {
  real_estate?: boolean | null;
  keep_originals?: boolean | null;
  title: string;
  token: string;
  slug: string | null;
  cover_file_id: string | null;
  cover_storage_path: string | null;
  cover_date: string | null;
}
interface FileRow {
  id: string; delivery_id: string; original_name: string; storage_path: string; thumbnail_storage_path: string | null;
  original_storage_path: string | null; media_type: string | null; width: number | null; height: number | null;
  duration_seconds: number | null; size_bytes: number | null; stage: string | null; position: number;
}

const sign = (key: string, expiresIn = 3600) => (r2Configured() ? r2PresignedUrl({ method: "GET", key, expiresIn }) : "");

/** Everything the hub page needs for one client. Exported so it can be
 *  driven without a token row (local preview, tests). */
export async function buildHub(orgId: string, clientId: string) {
  const [{ data: client }, { data: org }, { data: projects }] = await Promise.all([
    supabase.from("clients").select("id, company, contact_name").eq("id", clientId).maybeSingle(),
    supabase.from("organizations").select("name, business_info").eq("id", orgId).maybeSingle(),
    supabase.from("projects").select("id").eq("org_id", orgId).eq("client_id", clientId),
  ]);
  if (!client) return null;
  const projectIds = new Set((projects || []).map((p: { id: string }) => p.id));

  const { data: dRows } = projectIds.size
    ? await supabase
        .from("deliveries")
        .select("id, project_id, status, view_only, password_hash, require_email, delivered_at, created_at, title, token, slug, cover_file_id, cover_storage_path, cover_date, real_estate, keep_originals")
        .eq("org_id", orgId)
        .in("project_id", [...projectIds])
    : { data: [] as DeliveryRow[] };
  const galleries = hubGalleries((dRows || []) as DeliveryRow[], projectIds);
  const galleryIds = galleries.map(g => g.id);

  const { data: fRows } = galleryIds.length
    ? await supabase.from("delivery_files").select("*").in("delivery_id", galleryIds).order("position")
    : { data: [] as FileRow[] };
  const files = (fRows || []) as FileRow[];
  const finished = files.filter(f => f.stage !== "proof");

  const galleryCards = galleries.map(g => {
    const mine = finished.filter(f => f.delivery_id === g.id);
    const coverFile = mine.find(f => f.id === g.cover_file_id && f.media_type !== "video") || mine.find(f => f.media_type !== "video");
    const coverKey = g.cover_storage_path || coverFile?.thumbnail_storage_path || coverFile?.storage_path || mine.find(f => f.thumbnail_storage_path)?.thumbnail_storage_path || "";
    return {
      id: g.id,
      title: g.title,
      url: g.slug ? `/g/${g.slug}` : `/deliver/${g.token}`,
      deliveredAt: g.delivered_at || g.created_at || null,
      coverDate: g.cover_date,
      coverUrl: coverKey ? sign(coverKey) : "",
      photoCount: mine.filter(f => f.media_type !== "video").length,
      filmCount: mine.filter(f => f.media_type === "video").length,
      gated: isGated(g),
    };
  });

  const titleById = new Map(galleries.map(g => [g.id, g.title]));
  // A hub is a standard client's, so the client-based real estate rule never
  // applies here — only a gallery's own switch does. Those hand over the
  // MLS-size copy, not the original (same rule as delivery-public.ts).
  const mlsOnly = new Set(galleries.filter(g => g.real_estate === true && g.keep_originals !== true).map(g => g.id));
  const merged = hubMergedFiles(files, galleries).map(f => {
    const isVideo = f.media_type === "video";
    const safeName = (f.original_name || "download").replace(/["\\\r\n]/g, "");
    const downloadKey = !mlsOnly.has(f.delivery_id) && f.original_storage_path && !isCameraRaw(f.original_storage_path) ? f.original_storage_path : f.storage_path;
    return {
      id: f.id,
      galleryId: f.delivery_id,
      galleryTitle: titleById.get(f.delivery_id) || "",
      originalName: f.original_name,
      sizeBytes: f.size_bytes || 0,
      width: f.width,
      height: f.height,
      mediaType: isVideo ? "video" : "image",
      durationSeconds: f.duration_seconds ?? null,
      url: sign(f.storage_path),
      thumbnailUrl: f.thumbnail_storage_path ? sign(f.thumbnail_storage_path) : "",
      downloadUrl: r2Configured()
        ? r2PresignedUrl({ method: "GET", key: downloadKey, expiresIn: 3600, responseHeaders: { "Content-Disposition": `attachment; filename="${safeName}"` } })
        : "",
    };
  });

  const info = publicBusinessInfo(org?.business_info);
  return {
    hub: {
      clientName: client.company || client.contact_name || "",
      firstName: (client.contact_name || "").trim().split(/\s+/)[0] || "",
      tone: resolveTone("", client),
      presenter: org?.name || "",
      website: typeof info?.website === "string" ? info.website : "",
    },
    galleries: galleryCards,
    films: merged.filter(f => f.mediaType === "video"),
    photos: merged.filter(f => f.mediaType !== "video"),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = (req.query.token as string) || "";
  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    const { data: hub } = await supabase.from("client_hubs").select("org_id, client_id").eq("token", token).maybeSingle();
    if (!hub) return res.status(404).json({ error: "Hub not found" });
    const built = await buildHub(hub.org_id, hub.client_id);
    if (!built) return res.status(404).json({ error: "Hub not found" });
    return res.status(200).json({ ok: true, ...built });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }
}
