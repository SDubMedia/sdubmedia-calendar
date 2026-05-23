// Public endpoint for the collection landing page at /c/:slug.
// Returns the collection metadata + every gallery linked to it, with a
// signed cover URL per gallery so the cards display real previews.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "./_auth.js";
import { r2Configured, r2PresignedUrl } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

interface CollectionRow { id: string; org_id: string; name: string; slug: string | null; cover_subtitle: string | null }
interface DeliveryRow { id: string; title: string; token: string; slug: string | null; cover_file_id: string | null }
interface FileRow { id: string; storage_path: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = (req.query.slug as string) || "";
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    const { data: collection } = await supabase
      .from("delivery_collections")
      .select("id, org_id, name, slug, cover_subtitle")
      .eq("slug", slug)
      .maybeSingle<CollectionRow>();
    if (!collection) return res.status(404).json({ error: "Collection not found" });

    // All deliveries linked to this collection that are sent or beyond
    const { data: deliveries } = await supabase
      .from("deliveries")
      .select("id, title, token, slug, cover_file_id")
      .eq("collection_id", collection.id)
      .in("status", ["sent", "submitted", "working", "delivered"])
      .order("created_at", { ascending: false });
    const dRows = (deliveries || []) as DeliveryRow[];

    // For each gallery, pick its cover file (or first file) and generate a
    // signed URL for the card preview.
    const allFiles: Array<{ delivery_id: string; id: string; storage_path: string; position: number }> = [];
    if (dRows.length > 0) {
      const { data: files } = await supabase
        .from("delivery_files")
        .select("delivery_id, id, storage_path, position")
        .in("delivery_id", dRows.map((d) => d.id))
        .order("position");
      if (files) allFiles.push(...files);
    }

    const galleries = dRows.map((d) => {
      const filesForDelivery = allFiles.filter((f) => f.delivery_id === d.id);
      const cover = filesForDelivery.find((f) => f.id === d.cover_file_id) || filesForDelivery[0] || null;
      const coverUrl = cover && r2Configured()
        ? r2PresignedUrl({ method: "GET", key: (cover as FileRow).storage_path, expiresIn: 3600 })
        : null;
      return {
        id: d.id,
        title: d.title,
        token: d.token,
        slug: d.slug,
        coverUrl,
        fileCount: filesForDelivery.length,
      };
    });

    const { data: org } = await supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", collection.org_id)
      .single();

    return res.status(200).json({
      ok: true,
      collection: {
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        coverSubtitle: collection.cover_subtitle,
      },
      galleries,
      org: org ? { name: org.name, logoUrl: org.logo_url } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }
}
