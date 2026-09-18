// Signed GET URLs for gallery files, shared by the photo picker and the flyer
// editor. Same API the gallery page uses; cached per gallery for the session.
import { getAuthToken } from "@/lib/supabase";

/** Signed GET URLs for a gallery's files, cached per gallery for the session. */
const urlCache = new Map<string, Promise<Map<string, string>>>();
export function signedUrlsFor(deliveryId: string, fileIds?: string[]): Promise<Map<string, string>> {
  const key = fileIds ? `${deliveryId}:${fileIds.slice().sort().join(",")}` : deliveryId;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const token = await getAuthToken();
    const res = await fetch("/api/deliveries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "signed-urls", deliveryId, ...(fileIds ? { fileIds } : {}) }),
    });
    if (!res.ok) throw new Error(`Couldn't load photos (${res.status})`);
    const body = await res.json();
    const m = new Map<string, string>();
    for (const u of (body.urls || []) as { id: string; url: string }[]) if (u.url) m.set(u.id, u.url);
    return m;
  })();
  p.catch(() => urlCache.delete(key));   // let a failed fetch be retried
  urlCache.set(key, p);
  // Signed URLs last an hour; forget them a little before that.
  setTimeout(() => urlCache.delete(key), 50 * 60_000);
  return p;
}

